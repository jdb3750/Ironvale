---
name: iron-vale-ops
description: Operational playbooks for Iron Vale — safely restarting/redeploying the live server on port 8321, the full scratch-DATA_DIR testing recipe, correcting live game data (raid.json, ledger) when something was recorded incorrectly, and opening pull requests. Use when deploying a backend change, setting up a test run, or fixing/amending already-synced live data.
---

# Iron Vale — operational playbooks

## Typical branch / commit / push loop

```sh
git switch -c feat/<thing>            # branch off main
# ...edit, then verify on port 8322 with a scratch DATA_DIR (never 8321)...
git add -A                            # confirm `git status` excludes data/
git commit -m "<imperative subject>"  # body explains why + migrations
# ...when Joe says so: git push -u origin feat/<thing>
```

## Redeploy procedure (port 8321, the LIVE game)

Use this after committing **backend `.py`** changes so the running game picks
them up. Static JS/CSS/HTML do NOT need this — they're served fresh from disk
on every request. Python modules are loaded once at uvicorn startup, so a
restart is required for any `.py` edit to take effect on a running server.

1. **Identify the real LISTEN-state process** — filter to the listening socket,
   do NOT use bare `lsof -ti :8321`:
   ```sh
   lsof -iTCP:8321 -sTCP:LISTEN -t
   ```
   Bare `lsof -ti :8321` can return multiple pids, including unrelated
   processes that merely hold a stale/closed socket referencing the port
   (observed in a real session: an unrelated helper showed up alongside the
   actual uvicorn listener). Killing all of them can take down the wrong
   process. `lsof -iTCP:8321 -sTCP:LISTEN -t` returns only the real listener.
   (Same filter for port 8322 when restarting the test server.)
2. **Capture the exact launch context BEFORE killing** — command line, cwd,
   and env (notably `DATA_DIR`), so you can relaunch identically. For example
   inspect the PID's full command:
   ```sh
   ps -o command= -p $(lsof -iTCP:8321 -sTCP:LISTEN -t)
   ```
   Note the cwd and any `DATA_DIR=` / port flags. The live server must keep
   pointing at the real `data/` (Joe's live save) — NEVER point 8321 at a
   test/scratch database.
3. **Kill only that PID**:
   ```sh
   kill $(lsof -iTCP:8321 -sTCP:LISTEN -t)
   ```
4. **Relaunch identically, detached/backgrounded** so it survives the session
   ending (e.g. with `nohup ... &` or the same launch mechanism Joe uses).
   Preserve the exact `DATA_DIR`, port, and uvicorn flags you captured.
5. **Verify it came back up** with a read-only curl, e.g.:
   ```sh
   curl -sS http://localhost:8321/ -o /dev/null -w "%{http_code}\n"
   ```
   Confirm a 200 (or the expected response) before walking away.

## Testing recipe

```sh
# backend, always against scratch:
DATA_DIR=/tmp/iv-scratch .venv/bin/python - <<'EOF'
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
c.post("/api/profiles/select", json={"slug": "main"})   # cookie needed first!
...
EOF

# frontend: start "iron-vale-test" (port 8322, scratch DATA_DIR), then drive
# the preview browser. Dev mode (Settings) seeds fake training/wellness/gold.
# After JS edits: bump ?v=N in index.html AND hard-navigate the preview page.
```

`node --check static/js/*.js` catches syntax errors cheaply. TestClient covers
API flows; the dungeon can be bot-walked with random moves (prior sessions did
exactly this to find Pip/relics).

TestClient gotchas (see also skill `iron-vale-gotchas`):
- Select a profile first (`c.post("/api/profiles/select", ...)`) or requests
  hit the default DB.
- The contextvar `db.set_profile()` sets is scoped to the current asyncio
  task, so a top-level `db.set_profile(path)` in a test script does NOT carry
  into TestClient requests. For direct DB manipulation in tests, use
  `db.set_profile(db.DB_PATH)` (resolves to the same `ironvale.db` the
  middleware routes to for "main") rather than hardcoding a custom filename.

## Live data correction playbook

When something already-synced was recorded incorrectly (e.g. a mis-recorded
activity duration that also fed raid boss damage), treat it like any other
live-data mutation (CRITICAL SAFETY RULES: additive, log to the ledger, tell
Joe exactly what changed). Repeatable choreography, honed in a real session:

1. **Back up first.** Copy the target file(s) under `data/` to `/tmp/` before
   touching anything, so you can diff/restore if the edit goes wrong.
2. **Re-verify preconditions EXACTLY before editing.** Don't assume values are
   still what you last saw — re-read the file and confirm the field(s) you're
   about to change match expectations. Live data can shift between reads
   (sync loop, gameplay).
3. **Make the minimal, precisely-scoped edit**, preserving every other
   field/key untouched. Don't rewrite the whole JSON; patch the one value.
4. **Re-read to confirm the write** matches expectations.
5. **Log an "amend" event to the `ledger` table** describing exactly what
   changed, in-world voice ("Wick corrected the record: ..."). Use
   `db.log_event` if going through `db.py`'s connection machinery is safe; if
   that risks unwanted side effects (e.g. re-triggering the very routing you
   don't want), do a direct scoped `INSERT INTO ledger` instead.
6. **Correct ALL places the fact is recorded, not just the user-visible one.**
   If the data has both a summary field and a detailed log/history field that
   reference the same fact (e.g. `data/raid.json`'s `blows` AND its `log` both
   recording a hit), fix both for consistency.
7. **Get independent verification** that the correction is reflected
   everywhere before considering it done — a second read-only pass, or a QA
   subagent hitting the live read-only API, confirming the corrected value
   shows up in every surface (summary, history, calendar, raid state, etc.).

## Opening pull requests (Codeberg)

The repo's remote `origin` is `git@codeberg.org:bonez/Ironvale.git` (Codeberg,
SSH). Push with plain `git push` / `git push -u origin <branch>`; SSH auth is
already configured. To open the PR itself, see the global skill
`codeberg-pr` (the `tea` CLI, its `tea pulls create` verb, and a curl
fallback).
