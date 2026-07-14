# IRON VALE

*A self-hostable fitness RPG in the style of old-school CRPGs (think SKALD / DOS-era).
Your real workouts are the quests. Your sweat is the XP.*

## The loop

1. **Visit a quest-giver** in town. Each one hands out a different kind of training:
   - **Old Fenn the Wayfarer** — running quests (easy runs, tempo, intervals, hills, long runs)
   - **Grunhilda Iron-Bell** — kettlebell routines
   - **Ser Bram the Loadbearer** — barbell / dumbbell / bodyweight strength work
   - **Sage Elowen** — mobility, walking, recovery (grants bonus Vigor)
2. **Do the workout.** Runs are verified automatically against your intervals.icu
   activity feed; lifts are logged set-by-set in the mobile-friendly Training Log
   (big buttons, weight/rep steppers — designed for a phone on a gym bench).
3. **Turn in the quest** for XP, gold, Vigor, stat gains (STR/END/CON/SPR), brass
   tokens, and item drops — with a proper fanfare.
4. **Spend it**: buy gear and potions at **Pip's Provisions**, or feed a token to
   **the Crankwerk** (a quarter-crank gumball machine) for a random item, up to
   legendary rarity.
5. **Descend into the Undercroft** — a roguelike dungeon crawler. Entry costs
   **Vigor, which only comes from completed workouts**. Fight monsters, loot
   chests, kill the boss every 3rd floor, and either **retire at the stairs to
   bank your loot and depth**, or push deeper. **If you die: all unbanked loot is
   gone, your depth resets to floor 1, and the dungeon claims one item from your
   pack as toll.**

## Quests adapt to *your* data

- Running quest durations are derived from your last 60 days of runs (median,
  80th percentile, weekly volume). If you typically run 25 minutes, you will not
  be asked to run 2 hours.
- Strength quests track **which muscle groups you trained recently** and target
  the neglected ones. Suggested weights come from your own logged history.
- The **Ambition** setting (Mend / Keep / Forge / Conquer) scales everything up
  or down — recover mode to aggressive-improvement mode.
- Quest offers rotate daily, with variety built in (tempo vs intervals vs hills;
  heavy/low vs volume vs circuit styles). Don't like today's offers? Pay 10 gold
  for a reroll.

## Data sources

- **Activities**: [intervals.icu](https://intervals.icu) — free, and it syncs
  from **Garmin**, **Strava**, Coros, Polar, etc., so connecting it covers all
  of those. Enter your athlete ID (`i12345`) and API key (intervals.icu →
  Settings → Developer) in the in-game Settings scroll. Runs, rides, climbing,
  bouldering, weight training, yoga and more are recognized and color-coded.
  The first sync pulls ~400 days of history; after that the app re-syncs
  automatically every 15 minutes (`SYNC_INTERVAL_SECONDS` to change).
- **Wellness**: HRV, resting HR, VO2max, bodyweight, sleep and fitness (CTL)
  also sync from intervals.icu, feeding the Vitals charts and the "Readings of
  the Omens" insights in the Hall of Records.
- **Lifts / weights**: entered set-by-set in the Training Yard (phone-friendly).
- **Forgot your tracker?** Confess the deed to **Wick the Scrivener** in the
  Ledger House — unverified workouts pay prorated rewards (7 coins in 10).
  Wick also strikes errant entries from the record, as does tapping any day in
  the Calendar of Deeds.

## The Menagerie

Monsters live here. Every creature is **procedurally generated** from a DNA
seed — body, palette, eye count (usually two, occasionally not), horns, legs,
personality ("suspicious of birds", "convinced it is a dog"). Get them by
**ripping packs** — each pack belongs to a procedurally-titled numbered series
("Series 3: The Sunken Court"), recorded on every monster's card — or by
**subduing** Undercroft dwellers in combat; bosses yield rares. The herd
wanders the pen Chao-garden style: grazing, sleeping, flirting. Tap one to
meet it, **grab and drag one to relocate it** (they hate this and will tell
you), set one free when the pen gets political. The **Crankwerk** vends
hats and pen decorations — select a hat from the hat box, tap a monster,
and it wears it forever.

## The Undercroft economy (Binding-of-Isaac rules)

You descend with nothing but the stats your training earned. **Everything is
found below**: Pip trades on every floor (loot-gold prices), every floor has a
**relic pedestal** bearing a free weapon, armor, charm, or trinket, chests
hide consumables and trinkets, and monsters drop supplies. **Nothing leaves
the dungeon** — retire at the stairs and only your looted gold banks; die and
even that stays down there, plus your depth resets to floor 1.

## Doctrines & routines

Grunhilda and Ser Bram each honor sworn training programs: **Starting
Strength**, **StrongLifts 5x5**, **Simple & Sinister**, and Dan John's **Armor
Building Complex** are built in, or forge your own routine in the Doctrines
screen. A sworn doctrine's next session leads that giver's daily offers, with
linear-progression weight suggestions (+2.5 per completed session, +5 for
deadlift). The Exercise Compendium in the Hall of Records shows front/back body
maps of the muscle groups every exercise targets — synced climbing credits
back, arms and core in the muscle ledger too.

## The Siege (weekly raid)

Every Monday a procedurally generated horror — *Old Man Torpor, the Long
Sit*; *Grandmother Rot, the Snoozebringer* — camps outside the town walls,
sharing one HP pool across **every adventurer on the server**. Its health
scales to the roster's combined recent training volume, and the only way to
hurt it is to actually train: every synced workout from any profile strikes
it automatically (1 active minute = 10 damage), with a running battle log on
the town screen. Fell it before the week turns and everyone claims the
spoils: that week's **siege-exclusive trophy hat** for the menagerie, a
monster pack, and brass tokens. Fail, and it lumbers off into the Chronicle.
Your friends' Saturday runs might land the killing blow for you — or yours
for them.

## Playing with friends

One Iron Vale can host the whole party. The first visit shows a **"WHO GOES
THERE?"** roster — each newly created adventurer requires exactly a four-digit
PIN and gets a completely separate save: their own character, appearance,
quests, intervals.icu link, monsters, and streaks. An automatically adopted
legacy `main` profile may remain PINless. Auto-sync runs for every profile.
Switch adventurers anytime from Settings.

To let friends reach your instance:

- **Tailscale (easiest, private)**: install Tailscale on your host and their
  devices, share your machine into their tailnet, and they open
  `http://your-host:8321`. Nothing is exposed to the public internet.
- **Public hosting**: run it on a VPS or expose a port — in that case set
  `APP_PASSWORD=something` so the whole instance is gated, and give friends
  the password. PINs keep saves separate; the password keeps strangers out.
- Or friends can just self-host their own copy — it's one folder and a
  `docker compose up`.

## Self-hosting

### Docker (recommended)

```sh
docker compose up -d --build
# open http://localhost:8321
```

Game state persists in `./data`: one SQLite save per adventurer profile,
`profiles.json` for the roster, and shared `raid.json` for the weekly Siege.
Back up the whole directory. To require a password (recommended if exposed
beyond your LAN):

```sh
APP_PASSWORD=somesecret docker compose up -d --build
```

If you do not want to clone the project first, build directly from the remote
`main` branch and keep saves in a named Docker volume:

```sh
docker build -t ironvale 'https://codeberg.org/bonez/Ironvale.git#main'
docker run -d \
  --name ironvale \
  --restart unless-stopped \
  -p 8321:8321 \
  -v ironvale-data:/data \
  -e APP_PASSWORD="${APP_PASSWORD:-}" \
  ironvale
```

Rebuild the image and recreate the container when you want to pull a newer
version from `main`.

### Bare Python

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8321
```

No build step, no external assets, no telemetry. Fonts are vendored; sound is
synthesized in the browser. The only outbound call is to intervals.icu when you
sync.

## Tech

- **Backend**: FastAPI + SQLite (stdlib `sqlite3`), split into focused domain
  modules for quests, programs, dungeons, sync, monsters, raids, and more.
- **Frontend**: vanilla JS single-page app, hand-drawn pixel sprites rendered to
  canvas, WebAudio chiptune SFX, CRT scanline CSS. No framework, no bundler.

## Notes on honor

Run quests auto-verify against synced activities (≥70% of target duration,
started after you accepted the quest). Lift quests verify against logged sets
(≥60% of prescribed sets). Anything can also be completed "on your honor" —
it's your dungeon; cheat only yourself.
