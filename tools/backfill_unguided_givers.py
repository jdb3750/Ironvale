"""Correct the giver on historical unguided-activity quest rows.

Until seam 5 (2026-08-05), `_record_unguided_completion` wrote the literal
"endurance" into every unguided quest row regardless of what the deed actually
was, while the candidate that produced it already carried the right giver. So
a WeightTraining deed queued as Grunhilda's and was filed as Fenn's. The code
is fixed; rows written before that are still wrong.

The true giver is reconstructible: those rows store `category` and
`activity_type` in their details JSON, and the category-to-giver mapping is
imported from app.quests rather than restated here, so this tool cannot drift
from the rule it is enforcing.

SAFETY
------
* The database path is a required argument. There is no default, so this can
  never run against `data/` by accident.
* Dry-run is the default. `--apply` is required to write anything.
* `--apply` writes one ledger entry recording exactly what changed, per the
  live-data rule in AGENTS.md.
* Rows whose true giver cannot be determined are reported and left alone.

    python tools/backfill_unguided_givers.py <path-to.db>            # report
    python tools/backfill_unguided_givers.py <path-to.db> --apply    # correct
"""
import argparse
import json
import os
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Imported, never restated: one source of truth for what a deed's giver is.
from app.quests import DEED_GIVER_BY_CATEGORY  # noqa: E402
from app.game import category  # noqa: E402


def true_giver(details_json):
    """The giver a row should carry, or None if it cannot be determined."""
    try:
        details = json.loads(details_json)
    except (TypeError, ValueError):
        return None
    if not isinstance(details, dict):
        return None
    stored_category = details.get("category")
    if isinstance(stored_category, str) and stored_category in DEED_GIVER_BY_CATEGORY:
        return DEED_GIVER_BY_CATEGORY[stored_category]
    activity_type = details.get("activity_type")
    if isinstance(activity_type, str) and activity_type:
        return DEED_GIVER_BY_CATEGORY.get(category(activity_type))
    return None


def survey(conn):
    rows = conn.execute(
        "SELECT id, giver, details, completed_at FROM quests "
        "WHERE kind='unguided_activity' ORDER BY completed_at"
    ).fetchall()
    wrong, undeterminable, already_right = [], [], 0
    for row in rows:
        expected = true_giver(row["details"])
        if expected is None:
            undeterminable.append(row)
        elif expected != row["giver"]:
            wrong.append((row, expected))
        else:
            already_right += 1
    return rows, wrong, undeterminable, already_right


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", help="path to the profile .db to inspect")
    parser.add_argument("--apply", action="store_true",
                        help="write the corrections (default is report only)")
    args = parser.parse_args()

    if not os.path.exists(args.database):
        sys.exit(f"no such database: {args.database}")

    conn = sqlite3.connect(args.database)
    conn.row_factory = sqlite3.Row
    rows, wrong, undeterminable, already_right = survey(conn)

    print(f"database: {args.database}")
    print(f"unguided quest rows: {len(rows)}")
    print(f"  already correct:   {already_right}")
    print(f"  misattributed:     {len(wrong)}")
    print(f"  undeterminable:    {len(undeterminable)}")

    if wrong:
        moves = Counter(f"{row['giver']} -> {expected}" for row, expected in wrong)
        print("\nchanges by direction:")
        for move, count in sorted(moves.items()):
            print(f"  {count:4d}  {move}")
        print("\nrows:")
        for row, expected in wrong:
            when = (row["completed_at"] or "")[:10]
            print(f"  #{row['id']:<6} {when}  {row['giver']} -> {expected}")

    if undeterminable:
        print("\nleft alone (no category or activity_type in details):")
        for row in undeterminable:
            print(f"  #{row['id']:<6} {(row['completed_at'] or '')[:10]}  {row['giver']}")

    if not args.apply:
        print("\nDRY RUN — nothing written. Re-run with --apply to correct these.")
        return

    if not wrong:
        print("\nnothing to correct.")
        return

    summary = ", ".join(f"{count} {move}" for move, count in sorted(
        Counter(f"{row['giver']}->{expected}" for row, expected in wrong).items()))
    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        for row, expected in wrong:
            conn.execute("UPDATE quests SET giver=? WHERE id=?", (expected, row["id"]))
        conn.execute(
            "INSERT INTO ledger (ts, kind, text) VALUES (?, 'migration', ?)",
            (stamp, f"Backfill: corrected the giver on {len(wrong)} unguided deed(s) "
                    f"misfiled before per-deed attribution shipped ({summary})."),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    _, still_wrong, _, _ = survey(conn)
    print(f"\nAPPLIED — {len(wrong)} row(s) corrected, {len(still_wrong)} still wrong.")
    print("One ledger entry was written recording the change.")


if __name__ == "__main__":
    main()
