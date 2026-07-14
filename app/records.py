"""The Hall of Records' backend: stats, insights, wellness, calendar,
tapestry, almanac, keepsakes, chronicle, and the NPCs' data-aware notices.
Everything here READS the save and narrates it — no mutations to character
or quests. Split out of game.py in the pre-1.0 refactor.

Import direction: may import game (shared core) and db; never the reverse."""
import random
from datetime import datetime, timedelta

from . import db
from .game import (
    CATEGORIES, RUN_TYPES, category, get_char, get_settings, muscle_recency,
    now, run_history, today,
)

def wellness_series(days=180):
    """days<=0 means "all time" — no cutoff at all."""
    if days and days > 0:
        cutoff = (now() - timedelta(days=days)).date().isoformat()
        rows = db.q("SELECT * FROM wellness WHERE date >= ? ORDER BY date", (cutoff,)).fetchall()
    else:
        rows = db.q("SELECT * FROM wellness ORDER BY date").fetchall()
    return [dict(r) for r in rows]


def insights():
    """Plain-spoken readings of the omens: wellness trends + training balance."""
    out = []
    week_acts = db.q(
        "SELECT type FROM activities WHERE start >= ?",
        ((now() - timedelta(days=7)).isoformat(),),
    ).fetchall()
    if week_acts:
        tally = {}
        for a in week_acts:
            cat = category(a["type"])
            tally[cat] = tally.get(cat, 0) + 1
        nice = {"run": "run", "ride": "ride", "climb": "climb", "strength": "lifting session",
                "mobility": "mobility session", "walk": "walk", "swim": "swim", "other": "other deed"}
        parts = [f"{n} {nice.get(k, k)}{'s' if n > 1 else ''}" for k, n in sorted(tally.items(), key=lambda x: -x[1])]
        out.append(["info", f"This week the ledger shows: {', '.join(parts)}."])
    rows = db.q(
        "SELECT * FROM wellness WHERE date >= ? ORDER BY date",
        ((now() - timedelta(days=60)).date().isoformat(),),
    ).fetchall()

    def vals(field, subset=None):
        src = subset if subset is not None else rows
        return [r[field] for r in src if r[field] is not None]

    def avg(v):
        return sum(v) / len(v) if v else None

    week, before = rows[-7:], rows[:-7]
    hrv_w, hrv_b = avg(vals("hrv", week)), avg(vals("hrv", before))
    if hrv_w and hrv_b:
        delta = (hrv_w - hrv_b) / hrv_b * 100
        if delta >= 4:
            out.append(["good", f"HRV runs {delta:.0f}% above your baseline. Recovery favors you — a hard quest would land well."])
        elif delta <= -4:
            out.append(["warn", f"HRV sits {abs(delta):.0f}% below baseline. Favor easy quests, or let Sage Elowen have you for a day."])
    rhr_w, rhr_b = avg(vals("resting_hr", week)), avg(vals("resting_hr", before))
    if rhr_w and rhr_b:
        d = rhr_w - rhr_b
        if d >= 3:
            out.append(["warn", f"Resting heart rate is up {d:.0f} bpm on the week. The body whispers before it shouts."])
        elif d <= -2:
            out.append(["good", f"Resting heart rate is down {abs(d):.0f} bpm — the engine grows quieter at idle."])
    vo2 = vals("vo2max")
    if len(vo2) >= 2 and abs(vo2[-1] - vo2[0]) >= 0.5:
        d = vo2[-1] - vo2[0]
        out.append(["good" if d > 0 else "info", f"VO2max moved {'+' if d > 0 else ''}{d:.1f} over ~two months (now {vo2[-1]:.1f})."])
    ctl = vals("ctl")
    if len(ctl) >= 28:
        d = ctl[-1] - ctl[-28]
        if d >= 3:
            out.append(["good", f"Fitness (CTL) climbed {d:.0f} points this month. The grind is working."])
        elif d <= -3:
            out.append(["info", f"Fitness (CTL) slipped {abs(d):.0f} points this month. The Vale takes no offense; it simply remembers."])
    sleep = avg(vals("sleep_secs", week))
    if sleep:
        h = sleep / 3600
        if h >= 7.5:
            out.append(["good", f"Sleeping {h:.1f}h a night this week. The forge of recovery runs hot — the body will take the work."])
        elif h >= 6.5:
            out.append(["info", f"Averaging {h:.1f}h of sleep this week. Passable, but an extra half-hour would pay dividends."])
        else:
            out.append(["warn", f"Only {h:.1f}h of sleep a night this week. Even heroes are mostly made in bed — protect the dark hours."])

    h = run_history()
    if h["n"] >= 4:
        out.append(["info", f"Typical run: {h['median']:.0f} min. Weekly volume: {h['weekly_min']:.0f} min. Quests are sized to this."])
    stale = [(g, m["days_since"]) for g, m in muscle_recency().items() if 10 <= m["days_since"] < 999]
    if stale:
        names = ", ".join(g for g, _ in sorted(stale, key=lambda x: -x[1])[:3])
        out.append(["warn", f"Neglected muscle groups: {names}. The givers will steer you there."])
    c = get_char()
    if c["streak"]["count"] >= 3:
        out.append(["good", f"A {c['streak']['count']}-day streak burns. Feed it."])
    if not out:
        out.append(["info", "The ravens have little to report yet. Link intervals.icu in Settings, or go make some history."])
    return out


# ---------------- NPCs who've noticed ----------------

def _last_activity(cats):
    """(date-str, distance-km, minutes) of the most recent activity in the
    given categories, or (None, 0, 0)."""
    types = [t for c in cats for t in CATEGORIES[c]]
    ph = ",".join("?" * len(types))
    row = db.q(f"SELECT start, distance, moving_time FROM activities "
               f"WHERE type IN ({ph}) ORDER BY start DESC LIMIT 1", types).fetchone()
    if not row:
        return None, 0, 0
    return row["start"][:10], (row["distance"] or 0) / 1000, round((row["moving_time"] or 0) / 60)


def _count_since(cats, days):
    types = [t for c in cats for t in CATEGORIES[c]]
    ph = ",".join("?" * len(types))
    since = (now() - timedelta(days=days)).isoformat()
    return db.q(f"SELECT COUNT(*) AS n FROM activities WHERE type IN ({ph}) AND start >= ?",
                types + [since]).fetchone()["n"]


NOTICE_CHANCE = 0.3  # a small chance a giver remarks at all, per giver per day


def npc_notices():
    """One line per quest-giver that proves they've been paying attention to
    your actual training — spoken instead of a canned greeting when there is
    something worth remarking on. Seeded per day so a giver doesn't change
    their mind between taps. Deliberately not on every visit and never
    scolding: a small chance to remark, softly, same as a friend would."""
    rng = random.Random(f"notice:{today()}")
    name = get_char()["name"]
    out = {}

    def gap_days(dstr):
        return (now().date() - datetime.fromisoformat(dstr).date()).days if dstr else None

    def roll():
        return rng.random() < NOTICE_CHANCE

    # Old Fenn — the road
    d, km, mins = _last_activity(["run"])
    g = gap_days(d)
    week_runs = _count_since(["run"], 7)
    if g is not None and g <= 1 and km >= 1 and roll():
        out["running"] = rng.choice([
            f"Still dusty from those {km:.1f} kilometers, I see. The milestones were just talking about it.",
            f"{km:.1f} kilometers, {'today' if g == 0 else 'yesterday'}. The road speaks well of you, {name} — and roads are poor liars.",
        ])
    elif week_runs >= 4 and roll():
        out["running"] = rng.choice([
            f"{week_runs} runs inside a week. The crows can barely keep up their reports.",
            f"{week_runs} runs this week, {name} — even the hills have stopped betting against you.",
        ])
    elif g is not None and g >= 10 and roll():
        out["running"] = rng.choice([
            f"Haven't seen your boots on the road in {g} days, {name}. No hurry — it'll be there.",
            f"The road's gone quiet without you, {g} days now. It's not going anywhere, whenever you are.",
        ])

    # One 14-day fetch feeds both iron-givers: Grunhilda's recent-set count
    # and Bram's heaviest pull come from the same rows.
    fortnight = [dict(r) for r in db.q(
        "SELECT ts, exercise, weight FROM lift_sets WHERE ts >= ?",
        ((now() - timedelta(days=14)).isoformat(),)).fetchall()]
    two_days_ago = (now() - timedelta(days=2)).isoformat()
    recent_sets = sum(1 for r in fortnight if r["ts"] >= two_days_ago)
    last_set = db.q("SELECT MAX(ts) AS t FROM lift_sets").fetchone()["t"]
    sg = gap_days(last_set[:10]) if last_set else None

    # Grunhilda — the bell
    if recent_sets > 0 and roll():
        out["kettlebell"] = rng.choice([
            f"{recent_sets} sets rang out of you these past days. Grandmother heard every one.",
            f"The forge counted {recent_sets} sets off you lately, {name}. It hums when it's pleased.",
        ])
    elif sg is not None and sg >= 10 and roll():
        out["kettlebell"] = rng.choice([
            f"The bells have missed your grip these {sg} days, {name}. They'll ring whenever you're ready.",
            f"It's been {sg} days since the iron sang. No judgment here — just saying I noticed.",
        ])

    # Ser Bram — the heaviest recent pull
    heavy = max(fortnight, key=lambda r: r["weight"] or 0, default=None)
    if heavy and heavy["weight"] and roll():
        wu = get_settings().get("weight_unit", "kg")
        w = round(heavy["weight"] * 2.2046226218) if wu == "lb" else round(heavy["weight"])
        out["strength"] = rng.choice([
            f"Word in the keep is a {w}{wu} {heavy['exercise'].lower()} this fortnight. A knight notices such things.",
            f"That {w}{wu} {heavy['exercise'].lower()} did not go unwitnessed, {name}. The plates talk amongst themselves.",
        ])
    elif sg is not None and sg >= 14 and roll():
        out["strength"] = rng.choice([
            f"It's been a fortnight and more since the plates felt your hands, {name}. They'll keep, however long.",
            f"{sg} days since that bar moved. Rest is allowed to be rest — just come say hello sometime.",
        ])

    # Sage Elowen — stillness
    d, _, mins = _last_activity(["mobility"])
    g = gap_days(d)
    if g is not None and g <= 2 and mins and roll():
        out["mobility"] = rng.choice([
            f"I felt those {mins} minutes of stillness from across the square. The willow is still nodding.",
            f"{mins} quiet minutes, {'today' if g == 0 else 'not long ago'}, {name}. Your joints speak more kindly of you already.",
        ])
    elif g is not None and g >= 10 and roll():
        out["mobility"] = rng.choice([
            f"The cushion still holds your shape, {name}, {g} days on. Come sit whenever the world allows it.",
            f"It's been {g} quiet days since we last sat together. No scolding — just glad to see you when you come.",
        ])

    return out


# ---------------- the Mantel (keepsakes) ----------------

def _cumulative_km_date(cats, threshold):
    """Date the lifetime km in these categories crossed the threshold, else None."""
    types = [t for c in cats for t in CATEGORIES[c]]
    ph = ",".join("?" * len(types))
    total = 0.0
    for r in db.q(f"SELECT start, distance FROM activities WHERE type IN ({ph}) "
                  f"AND distance IS NOT NULL ORDER BY start", types).fetchall():
        total += (r["distance"] or 0) / 1000
        if total >= threshold:
            return r["start"][:10]
    return None


def _nth_activity_date(cats, n):
    types = [t for c in cats for t in CATEGORIES[c]]
    ph = ",".join("?" * len(types))
    row = db.q(f"SELECT start FROM activities WHERE type IN ({ph}) "
               f"ORDER BY start LIMIT 1 OFFSET ?", types + [n - 1]).fetchone()
    return row["start"][:10] if row else None


def keepsakes():
    """Objects the years leave on the shelf. Only what has actually been
    earned exists — the unearned are not listed, teased, or silhouetted;
    this is furniture, not a checklist."""
    c = get_char()
    out = []

    def add(sprite, name, lore, date):
        out.append({"sprite": sprite, "name": name, "lore": lore, "date": date})

    row = db.q("SELECT MIN(completed_at) AS t FROM quests WHERE status='done'").fetchone()
    if row["t"]:
        add("ks_quill", "The First Page",
            "The quill Wick lent you to sign your first completed quest. He never asked for it back. He counts it, though.",
            row["t"][:10])

    d = _cumulative_km_date(["run", "walk"], 100)
    if d:
        add("ks_boot", "A Worn Boot-Sole",
            "One hundred kilometers under your own feet wore this through. The cobbler framed it instead of mending it.",
            d)

    d = _cumulative_km_date(["ride"], 250)
    if d:
        add("ks_spoke", "A Bent Spoke-Pin",
            "Two hundred and fifty kilometers by wheel. This pin gave its life somewhere around the two-hundredth.",
            d)

    d = _nth_activity_date(["climb"], 25)
    if d:
        add("ks_chalk", "A Spent Chalk Nub",
            "Twenty-five times up the stone. This is all that remains of the first bag of chalk. The stone remembers your hands now.",
            d)

    d = _nth_activity_date(["mobility"], 25)
    if d:
        add("ks_leaf", "A Pressed Willow Leaf",
            "Twenty-five sittings in the quiet. Elowen pressed this leaf the day of the twenty-fifth and said nothing, in her way.",
            d)

    row = db.q("SELECT ts FROM lift_sets ORDER BY ts LIMIT 1 OFFSET 499").fetchone()
    if row:
        add("ks_nail", "An Iron Splinter",
            "Five hundred sets. This splinter worked loose from the forge floor around the four-hundredth and Grunhilda insisted you keep it.",
            row["ts"][:10])

    row = db.q("SELECT completed_at FROM quests WHERE status='done' AND honor=1 "
               "ORDER BY completed_at LIMIT 1 OFFSET 9").fetchone()
    if row:
        add("ks_seal", "Wick's Wax Seal",
            "Ten quests sworn and kept on your honor alone. Wick pressed this seal himself. His hand shook slightly, which for Wick is weeping.",
            row["completed_at"][:10])

    best = max(c["streak"].get("best") or 0, c["streak"].get("count") or 0)
    if best >= 30:
        add("ks_candle", "Candle of the Unbroken",
            f"Thirty days without dropping the thread — your longest ran {best}. It is never lit. That would rather miss the point.",
            None)

    if (c.get("deepest_floor") or 0) >= 4:
        add("ks_tooth", "The Gatekeeper's Knuckle",
            "Taken from the first great horror you felled on the Undercroft stairs. It still twitches toward the couch when the light is low.",
            None)

    row = db.q("SELECT MIN(ts) AS t FROM ledger WHERE kind='death'").fetchone()
    if row["t"]:
        add("ks_receipt", "The Warden's Receipt",
            "Issued upon your first death below. One (1) adventurer, returned used. Hesk says keeping it is good luck. Hesk is lying.",
            row["t"][:10])

    row = db.q("SELECT MIN(born) AS t FROM monsters").fetchone()
    if row["t"]:
        add("ks_shell", "A Speckled Eggshell",
            "From the first strange creature that chose your menagerie over the dark. It kept the shell tidy. They always do.",
            row["t"][:10])

    return out


def calendar_payload(year, month):
    from datetime import date as _date
    start = _date(year, month, 1)
    end = _date(year + (month == 12), month % 12 + 1, 1)
    days = {}

    def day(dstr):
        return days.setdefault(dstr, {"acts": [], "sets": 0, "quests": 0})

    for a in db.q(
        "SELECT * FROM activities WHERE start >= ? AND start < ? ORDER BY start",
        (start.isoformat(), end.isoformat()),
    ).fetchall():
        day(a["start"][:10])["acts"].append({
            "id": a["id"], "type": a["type"], "category": category(a["type"]),
            "name": a["name"], "minutes": round((a["moving_time"] or 0) / 60),
            "source": a["source"],
        })
    for r in db.q("SELECT ts FROM lift_sets WHERE ts >= ? AND ts < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        day(r["ts"][:10])["sets"] += 1
    for r in db.q("SELECT completed_at FROM quests WHERE status='done' AND completed_at >= ? AND completed_at < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        day(r["completed_at"][:10])["quests"] += 1
    return {"year": year, "month": month, "days": days}


def day_payload(dstr):
    acts = [dict(a) | {"category": category(a["type"]), "minutes": round((a["moving_time"] or 0) / 60)}
            for a in db.q("SELECT * FROM activities WHERE start LIKE ? ORDER BY start", (dstr + "%",)).fetchall()]
    sets_ = [dict(r) for r in db.q("SELECT * FROM lift_sets WHERE ts LIKE ? ORDER BY id", (dstr + "%",)).fetchall()]
    quests = [{"id": r["id"], "title": r["title"], "giver": r["giver"]}
              for r in db.q("SELECT * FROM quests WHERE status='done' AND completed_at LIKE ?", (dstr + "%",)).fetchall()]
    return {"date": dstr, "activities": acts, "sets": sets_, "quests": quests}


# ---------------- Maud's Almanac ----------------

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]

ALMANAC_CAT_PROSE = {
    "run": "the road took the most of you — mile upon honest mile",
    "ride": "the wheel carried you farthest this moon",
    "climb": "the stone claimed you — up and up, knuckles first",
    "strength": "the iron rang loudest in your ledger",
    "mobility": "the willow bent you gently, and you let it",
    "walk": "you went the old way — on foot, unhurried",
    "swim": "the water had you more than the land did",
    "other": "your labors defied my usual categories, which I resent",
}


def _month_range(mstr):
    from datetime import date as _date
    y, m = int(mstr[:4]), int(mstr[5:7])
    return _date(y, m, 1), _date(y + (m == 12), m % 12 + 1, 1)


def almanac_months():
    """Months holding any recorded labor, oldest first, excluding the current
    (still-unfinished) month. These are the published editions."""
    cur = now().strftime("%Y-%m")
    months = {r["m"] for r in db.q(
        "SELECT DISTINCT substr(start,1,7) AS m FROM activities").fetchall()}
    months |= {r["m"] for r in db.q(
        "SELECT DISTINCT substr(ts,1,7) AS m FROM lift_sets").fetchall()}
    return sorted(m for m in months if m < cur)


def _month_facts(mstr):
    start, end = _month_range(mstr)
    cat_secs, day_cats = {}, {}
    km_foot = km_wheel = 0.0
    for a in db.q("SELECT start, type, moving_time, distance FROM activities "
                  "WHERE start >= ? AND start < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        cat = category(a["type"])
        secs = a["moving_time"] or 0
        cat_secs[cat] = cat_secs.get(cat, 0) + secs
        day_cats.setdefault(a["start"][:10], set()).add(cat)
        km = (a["distance"] or 0) / 1000
        if cat in ("run", "walk"):
            km_foot += km
        elif cat == "ride":
            km_wheel += km
    sets = tonnage = 0
    for r in db.q("SELECT ts, weight, reps FROM lift_sets WHERE ts >= ? AND ts < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        sets += 1
        tonnage += (r["weight"] or 0) * (r["reps"] or 0)
        day_cats.setdefault(r["ts"][:10], set()).add("strength")
        cat_secs["strength"] = cat_secs.get("strength", 0) + 180
    quests = honors = 0
    for r in db.q("SELECT honor FROM quests WHERE status='done' "
                  "AND completed_at >= ? AND completed_at < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        quests += 1
        honors += 1 if r["honor"] else 0
    days_in_month = (end - start).days
    best = run_ = 0
    cur = start
    while cur < end:
        run_ = run_ + 1 if cur.isoformat() in day_cats else 0
        best = max(best, run_)
        cur += timedelta(days=1)
    return {
        "cat_secs": cat_secs, "days_active": len(day_cats),
        "days_in_month": days_in_month, "best_thread": best,
        "km_foot": round(km_foot, 1), "km_wheel": round(km_wheel, 1),
        "sets": sets, "tonnage": round(tonnage),
        "quests": quests, "honors": honors,
        "total_min": round(sum(cat_secs.values()) / 60),
    }


def _maud_prose(mstr, f, prev):
    rng = random.Random(f"almanac:{mstr}")
    month_name = MONTH_NAMES[int(mstr[5:7]) - 1]
    p = []
    ratio = f["days_active"] / f["days_in_month"]
    if f["days_active"] == 0:
        p.append(rng.choice([
            f"Of {month_name} the archive holds only blank pages. I filed them anyway. Hoo.",
            f"{month_name} passed without a single deed reaching my desk. The dust and I kept each other company.",
        ]))
        p.append("A month of stillness is not a verdict — but the next page is already open.")
        return p
    verdict = (
        "a relentless month — scarcely a page without ink" if ratio >= 0.8 else
        "a sturdy month, well-bound" if ratio >= 0.6 else
        "a fair month, though the margins show some rest" if ratio >= 0.4 else
        "a thin volume, this one — more white than ink" if ratio >= 0.2 else
        "a sparse record, held together by a few bright pages")
    p.append(rng.choice([
        f"So closes {month_name}: {f['days_active']} of its {f['days_in_month']} days bear your mark. I call it {verdict}.",
        f"The {month_name} edition is bound. {f['days_active']} days of {f['days_in_month']} carry ink — {verdict}.",
    ]))
    if f["cat_secs"]:
        top = max(f["cat_secs"], key=f["cat_secs"].get)
        p.append(f"Chief among your labors: {ALMANAC_CAT_PROSE.get(top, ALMANAC_CAT_PROSE['other'])}. "
                 f"Some {round(f['cat_secs'][top] / 60)} minutes of it, by my count, "
                 f"of {f['total_min']} in all.")
    if f["km_foot"] or f["km_wheel"]:
        bits = []
        if f["km_foot"]:
            bits.append(f"{f['km_foot']} km under your own feet")
        if f["km_wheel"]:
            bits.append(f"{f['km_wheel']} km by wheel")
        p.append(f"Ground covered: {' and '.join(bits)}. The Long Road remembers every step, even when you don't.")
    if f["sets"]:
        p.append(f"The iron ledger shows {f['sets']} sets — roughly {f['tonnage']:,} kg hoisted against the world's preference that it stay put.")
    if f["best_thread"] >= 3:
        p.append(f"Your longest unbroken thread ran {f['best_thread']} days. " + rng.choice([
            "Threads like that are how tapestries happen.",
            "I have seen guild charters with less consistency.",
            "The loom approves, and so, grudgingly, do I.",
        ]))
    if prev and prev["total_min"]:
        delta = f["total_min"] - prev["total_min"]
        if delta > prev["total_min"] * 0.1:
            p.append(f"Against the prior moon you rose: {abs(delta)} minutes more labor. The trend is noted and archived.")
        elif delta < -prev["total_min"] * 0.1:
            p.append(f"A quieter month than the last — {abs(delta)} minutes fewer. Sometimes the body writes 'rest' where the will writes 'more'. Both are entries.")
        else:
            p.append("Held steady against the prior moon, near enough. Consistency files itself.")
    p.append(rng.choice([
        "Filed, shelved, and sealed. The next edition is already gathering.",
        "So the record stands. Come argue with it in the Hall if you must. Hoo.",
        "The archive keeps what the memory drops. Onward.",
    ]))
    return p


def almanac_payload(month=None):
    months = almanac_months()
    if not months:
        return {"months": [], "month": None, "latest": None}
    if month is None or month not in months:
        selected_month = months[-1]
    else:
        selected_month = month
    idx = months.index(selected_month)
    facts = _month_facts(selected_month)
    prev = _month_facts(months[idx - 1]) if idx > 0 else None
    top_cats = sorted(facts["cat_secs"].items(), key=lambda kv: -kv[1])[:3]
    return {
        "months": months, "month": selected_month, "latest": months[-1],
        "label": f"{MONTH_NAMES[int(selected_month[5:7]) - 1]} {selected_month[:4]}",
        "narration": _maud_prose(selected_month, facts, prev),
        "figures": {**{k: v for k, v in facts.items() if k != "cat_secs"},
                    "top_cats": [[c, round(s / 60)] for c, s in top_cats]},
    }


def almanac_unread():
    """True when the newest edition hasn't been opened yet — lights the
    Hall's badge in town on the first visit after a month closes."""
    months = almanac_months()
    return bool(months) and db.kv_get("almanac_seen") != months[-1]


def almanac_mark_seen():
    months = almanac_months()
    if months:
        db.kv_set("almanac_seen", months[-1])


def tapestry_payload():
    """The Tapestry: a year of days, one stitch each, colored by the day's
    dominant labor. 53 week-columns (Monday-first) ending on the current
    week, so the newest stitch is always today.

    A day's color is the activity category with the most active seconds that
    day; logged lift sets count as ~3 minutes of 'strength' each, so a
    gym-only day (no synced activity) still weaves a red stitch."""
    end = now().date()
    week_monday = end - timedelta(days=end.weekday())
    start = week_monday - timedelta(weeks=52)
    per_day = {}
    for a in db.q(
        "SELECT start, type, moving_time FROM activities WHERE start >= ?",
        (start.isoformat(),),
    ).fetchall():
        rec = per_day.setdefault(a["start"][:10], {})
        cat = category(a["type"])
        rec[cat] = rec.get(cat, 0) + (a["moving_time"] or 0)
    for r in db.q("SELECT ts FROM lift_sets WHERE ts >= ?", (start.isoformat(),)).fetchall():
        rec = per_day.setdefault(r["ts"][:10], {})
        rec["strength"] = rec.get("strength", 0) + 180
    days = []
    cur = start
    while cur <= end:
        dstr = cur.isoformat()
        rec = per_day.get(dstr)
        cat = max(rec, key=rec.get) if rec else None
        days.append({"date": dstr, "cat": cat, "mins": round(sum(rec.values()) / 60) if rec else 0})
        cur += timedelta(days=1)
    woven = sum(1 for d in days if d["cat"])
    best = run = 0
    for d in days:
        run = run + 1 if d["cat"] else 0
        best = max(best, run)
    return {"start": start.isoformat(), "days": days, "woven": woven, "best_stretch": best}


def stats_payload(wellness_days=180):
    c = get_char()
    weeks = []
    for i in range(11, -1, -1):
        start = (now().date() - timedelta(days=now().date().weekday() + 7 * i))
        end = start + timedelta(days=7)
        ph = ",".join("?" * len(RUN_TYPES))
        run = db.q(
            f"SELECT COALESCE(SUM(moving_time),0) AS s, COALESCE(SUM(distance),0) AS d, COUNT(*) AS n "
            f"FROM activities WHERE type IN ({ph}) AND start >= ? AND start < ?",
            (*RUN_TYPES, start.isoformat(), end.isoformat()),
        ).fetchone()
        lift = db.q(
            "SELECT COUNT(*) AS n, COALESCE(SUM(weight*reps),0) AS tonnage FROM lift_sets WHERE ts >= ? AND ts < ?",
            (start.isoformat(), end.isoformat()),
        ).fetchone()
        weeks.append({
            "week": start.isoformat(),
            "run_min": round(run["s"] / 60), "run_km": round(run["d"] / 1000, 1), "runs": run["n"],
            "sets": lift["n"], "tonnage": round(lift["tonnage"]),
        })
    prs = db.q(
        "SELECT exercise, MAX(weight) AS max_w, MAX(weight * (1 + reps/30.0)) AS e1rm, COUNT(*) AS sets "
        "FROM lift_sets GROUP BY exercise ORDER BY max_w DESC"
    ).fetchall()
    recent = db.q(
        "SELECT * FROM activities ORDER BY start DESC LIMIT 15"
    ).fetchall()
    return {
        "character": c,
        "weeks": weeks,
        "muscles": muscle_recency(),
        "prs": [dict(r) for r in prs],
        "recent_activities": [dict(r) | {"category": category(r["type"])} for r in recent],
        "run_summary": {k: v for k, v in run_history().items() if k != "runs"},
        "wellness": wellness_series(wellness_days),
        "insights": insights(),
    }


def chronicle(limit=60):
    rows = db.q("SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]
