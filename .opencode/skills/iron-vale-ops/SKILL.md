---
name: iron-vale-ops
description: Operational playbooks for Iron Vale — the production deployment model (Portainer Docker auto-pulling origin/main), the full scratch-DATA_DIR testing recipe, running a local dev server, correcting live game data (raid.json, realm.json, ledger) on the server, and opening pull requests. Use when deploying a change, setting up a test run, or fixing/amending already-synced live data.
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

## Deployment (production = origin/main)

The live game runs on Joe's server as a **Docker instance managed by
Portainer** that tracks `origin/main` on Codeberg and **auto-pulls roughly
every 15 minutes**. There is no manual deploy step:

- **Merging a PR into `main` IS the deployment.** The change is live for
  every player within ~15 minutes. This is why nothing unverified may reach
  `main` — verify on the 8322 scratch setup first, always.
- There is nothing to restart locally. The old "restart uvicorn on 8321"
  choreography is obsolete; port 8321 on Joe's Mac is at most a personal
  dev instance nobody plays.
- To confirm a deploy landed, wait out the poll interval and check the
  live footer version (it renders the root `VERSION` file, which is read
  at container startup).
- Live player data (every profile DB, `raid.json`, `realm.json`,
  `profiles.json`) lives in the server container's data volume — NOT in
  this repo's local `data/`, which is a stale-but-real historical copy.

**Backups**: Iron Vale's Vault seals every profile DB and shared JSON into an
atomic daily snapshot under `data/backups/`, retaining 14 days. Those snapshots
share the live Docker volume, so they protect against application mistakes but
not disk or volume loss. Keep an off-volume host backup of the entire data
directory as the second layer.

## Running a local dev server (optional)

For local poking only (never the live game): run uvicorn on **8322 with a
scratch DATA_DIR** via the `iron-vale-test` launch config. If a stray local
server needs killing, filter to the actual listener — bare `lsof -ti :PORT`
can match unrelated processes holding stale sockets:

```sh
lsof -iTCP:8322 -sTCP:LISTEN -t   # the real listener, nothing else
```

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

# repeatable frontend checks (one-time: npm install && npx playwright install chromium)
npm run test:frontend
npm run test:browser   # owns port 8322 and creates/deletes a scratch DATA_DIR
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
Joe exactly what changed). **The live files are on the server** — corrections
happen against the Docker instance's data volume (via Portainer's console /
`docker exec`, or however Joe grants access), never against the local repo's
`data/` copy. Repeatable choreography, honed in a real session:

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
