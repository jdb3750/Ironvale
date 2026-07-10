"""Iron Vale — a self-hosted fitness RPG. FastAPI app: serves the API and the static frontend."""
import asyncio
import hashlib
import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import colosseum, db, dungeon, exercises, game, intervals, items, monsters, profiles, programs, raid, road

app = FastAPI(title="Iron Vale")

SYNC_INTERVAL = int(os.environ.get("SYNC_INTERVAL_SECONDS", "900"))  # 15 min

# App version shown in the footer; read once at startup from the root
# VERSION file (the single source of truth — see AGENTS.md "Versioning").
APP_VERSION = ""
try:
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")) as _f:
        APP_VERSION = _f.read().strip()
except OSError:
    pass


def _sync_one_profile(slug, path):
    token = db.set_profile(path)
    try:
        s = game.get_settings()
        if s["intervals_athlete_id"] and s["intervals_api_key"]:
            intervals.sync()
            game.auto_complete_ready()
            game.grant_unguided_run_bonus()  # queues Fenn's bubble for any run with no quest accepted
        game.resolve_rest_writs()  # dawn check runs even without intervals creds
        raid.apply_damage(slug)  # this week's uncounted deeds strike the siege
    finally:
        db.reset_profile(token)


@app.on_event("startup")
async def _start_auto_sync():
    async def loop():
        while True:
            for p in profiles.ensure_index():
                try:
                    await asyncio.to_thread(_sync_one_profile, p["slug"], os.path.join(db.DATA_DIR, p["file"]))
                except Exception:
                    pass  # ravens get lost sometimes; try again next tick
            await asyncio.sleep(SYNC_INTERVAL)
    asyncio.create_task(loop())

STATIC = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")


def _token():
    return hashlib.sha256(("ironvale:" + APP_PASSWORD).encode()).hexdigest()


@app.middleware("http")
async def no_stale_frontend(request: Request, call_next):
    """Frontend files revalidate on every load (cheap 304s) so game updates
    actually reach players without a hard refresh."""
    resp = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if APP_PASSWORD and request.url.path.startswith("/api/") and request.url.path != "/api/login":
        if request.cookies.get("ironvale") != _token():
            return JSONResponse({"error": "locked"}, status_code=401)
    # route this request at the chosen adventurer's save file
    slug = request.cookies.get("iv_profile")
    prof = profiles.get(slug) if slug else None
    token = db.set_profile(profiles.path_for(prof["slug"]) if prof else None)
    try:
        return await call_next(request)
    finally:
        db.reset_profile(token)


# ---------------- profiles ----------------

@app.get("/api/profiles")
def profile_list(request: Request):
    slug = request.cookies.get("iv_profile")
    current = slug if profiles.get(slug or "") else None
    roster = []
    for p in profiles.all_profiles():
        token = db.set_profile(profiles.path_for(p["slug"]))
        try:
            c = game.get_char()
            buddy = monsters.get_buddy()
        finally:
            db.reset_profile(token)
        # the roster shows the LIVE character name, not the frozen name from
        # profile creation — Settings lets you rename after the fact
        roster.append({**p, "name": c["name"], "appearance": c.get("appearance"), "level": c["level"], "buddy": buddy})
    return {"profiles": roster, "current": current}


def _profile_cookie(resp, slug):
    resp.set_cookie("iv_profile", slug, max_age=365 * 86400, httponly=True, samesite="lax")


@app.post("/api/profiles")
async def profile_create(request: Request):
    body = await request.json()
    entry = profiles.create(body.get("name"), body.get("pin") or None)
    resp = JSONResponse({"ok": True, "slug": entry["slug"]})
    _profile_cookie(resp, entry["slug"])
    return resp


@app.post("/api/profiles/select")
async def profile_select(request: Request):
    body = await request.json()
    p = profiles.verify(body.get("slug"), body.get("pin"))
    resp = JSONResponse({"ok": True, "slug": p["slug"]})
    _profile_cookie(resp, p["slug"])
    return resp


@app.post("/api/profiles/pin")
async def profile_set_pin(request: Request):
    body = await request.json()
    slug = request.cookies.get("iv_profile")
    if not slug or not profiles.get(slug):
        raise ValueError("No adventurer selected.")
    return profiles.set_pin(slug, body.get("pin"))


@app.post("/api/profiles/logout")
def profile_logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("iv_profile")
    return resp


@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse({"error": str(exc)}, status_code=400)


@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    if not APP_PASSWORD or body.get("password") == APP_PASSWORD:
        resp = JSONResponse({"ok": True})
        resp.set_cookie("ironvale", _token(), max_age=90 * 86400, httponly=True, samesite="lax")
        return resp
    raise ValueError("The gate does not open.")


# ---------------- state ----------------

@app.get("/api/state")
def state():
    s = game.get_settings()
    game.resolve_rest_writs()  # dawn check: opening the app resolves any kept/broken writ
    actives = []
    for q_ in game.active_quests():
        ok, note, _ = game.quest_completable(q_)
        actives.append({**q_, "completable": ok, "progress_note": note})
    return {
        "character": game.get_char(),
        "settings": {**s, "intervals_api_key": bool(s["intervals_api_key"])},
        "givers": game.GIVERS,
        "ambition_levels": game.AMBITION,
        "active_quests": actives,
        "inventory": _inventory(),
        "dungeon_active": dungeon.get_state() is not None,
        "resume_floor": db.kv_get("resume_floor", 1),
        "last_sync": db.kv_get("last_sync"),
        "combat_stats": dungeon.player_stats(),
        "xp_to_next": game.xp_to_next(game.get_char()["level"]),
        "buddy": monsters.get_buddy(),
        "needs_login": False,
        "unguided_pending": game.unguided_pending(),
        "writ_notices": game.writ_notices_pending(),
        "almanac_unread": game.almanac_unread(),
        "version": APP_VERSION,
    }


@app.post("/api/appearance")
async def save_appearance(request: Request):
    body = await request.json()
    c = game.get_char()
    ap = c.get("appearance", {})
    for k in ("skin", "hair", "hair_color", "shirt", "pants"):
        if k in body:
            ap[k] = int(body[k])
    c["appearance"] = ap
    game.save_char(c)
    return {"ok": True, "appearance": ap}


@app.post("/api/settings")
async def save_settings(request: Request):
    body = await request.json()
    s = game.get_settings()
    for k in ("ambition", "units", "weight_unit", "intervals_athlete_id", "dev_mode"):
        if k in body:
            s[k] = body[k]
    if body.get("intervals_api_key"):
        s["intervals_api_key"] = body["intervals_api_key"]
    db.kv_set("settings", s)
    if body.get("name"):
        c = game.get_char()
        c["name"] = str(body["name"])[:24]
        game.save_char(c)
    return {"ok": True}


# ---------------- quests ----------------

@app.get("/api/offers/{giver}")
def offers(giver: str, reroll: bool = False):
    if giver not in game.GIVERS:
        raise ValueError("No such quest-giver.")
    if reroll:
        c = game.get_char()
        if c["gold"] < 10:
            raise ValueError("A reroll costs 10 gold.")
        c["gold"] -= 10
        game.save_char(c)
    out = game.get_offers(giver, reroll=reroll)
    active = next((q for q in game.active_quests() if q["giver"] == giver), None)
    if active:
        ok, note, _ = game.quest_completable(active)
        active = {**active, "completable": ok, "progress_note": note}
    return {"offers": out, "active": active}


@app.post("/api/quests/accept")
async def accept(request: Request):
    body = await request.json()
    qid = game.accept_offer(body["giver"], body["offer_id"])
    return {"quest_id": qid}


@app.post("/api/quests/{quest_id}/complete")
async def complete(quest_id: int, request: Request):
    body = await request.json()
    rewards = game.complete_quest(quest_id, honor=bool(body.get("honor")))
    return {"rewards": rewards, "character": game.get_char()}


@app.post("/api/quests/{quest_id}/abandon")
def abandon(quest_id: int):
    game.abandon_quest(quest_id)
    return {"ok": True}


@app.get("/api/quests/log")
def quest_log():
    rows = db.q(
        "SELECT * FROM quests WHERE status != 'active' ORDER BY id DESC LIMIT 50"
    ).fetchall()
    return {"quests": [game._quest_row(r) for r in rows]}


# ---------------- training data ----------------

@app.post("/api/sync")
def sync(request: Request):
    new = intervals.sync()
    # synced activities auto-complete matching quests — return ceremonies for the UI
    completed = game.auto_complete_ready()
    game.grant_unguided_run_bonus()  # queues Fenn's bubble for any run with no quest accepted
    game.resolve_rest_writs()  # a freshly-synced hard workout may break an active writ
    raid_damage = raid.apply_damage(request.cookies.get("iv_profile"))
    return {"new_activities": new, "completed": completed, "raid_damage": raid_damage}


@app.post("/api/unguided/claim")
async def unguided_claim(request: Request):
    body = await request.json()
    return game.claim_unguided_bonus(body.get("activity_id"))


@app.post("/api/writ/ack")
async def writ_ack(request: Request):
    body = await request.json()
    return game.ack_writ_notice(body.get("ts"))


# ---------------- the long road ----------------

@app.get("/api/road")
def road_state():
    return road.state()


@app.get("/api/tapestry")
def tapestry():
    return game.tapestry_payload()


@app.get("/api/almanac")
def almanac(month: str = None):
    return game.almanac_payload(month)


@app.post("/api/almanac/seen")
def almanac_seen():
    game.almanac_mark_seen()
    return {"ok": True}


@app.post("/api/road/claim")
def road_claim():
    return road.claim_next()


# ---------------- the siege ----------------

@app.get("/api/raid")
def raid_state(request: Request):
    slug = request.cookies.get("iv_profile")
    raid.apply_damage(slug)  # catch honor/claimed/manual deeds without waiting for ravens
    return raid.state_for(slug)


@app.post("/api/raid/claim")
def raid_claim(request: Request):
    return raid.claim(request.cookies.get("iv_profile"))


@app.post("/api/activities/manual")
async def manual_activity(request: Request):
    body = await request.json()
    intervals.add_manual_activity(body)
    return {"ok": True}


@app.post("/api/lifts")
async def log_lift(request: Request):
    body = await request.json()
    ex = body.get("exercise", "").strip()
    if not ex:
        raise ValueError("Name the exercise.")
    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps, quest_id) VALUES (?,?,?,?,?)",
        (game.now_iso(), ex, float(body.get("weight", 0)), int(body.get("reps", 0)),
         body.get("quest_id")),
    )
    db.commit()
    return {"ok": True, "sets_today": db.q(
        "SELECT COUNT(*) AS n FROM lift_sets WHERE ts >= ?", (game.today(),)).fetchone()["n"]}


@app.delete("/api/lifts/last")
def undo_lift():
    row = db.q("SELECT id FROM lift_sets ORDER BY id DESC LIMIT 1").fetchone()
    if row:
        db.q("DELETE FROM lift_sets WHERE id=?", (row["id"],))
        db.commit()
    return {"ok": True}


@app.get("/api/lifts/recent")
def recent_lifts(limit: int = 20):
    rows = db.q("SELECT * FROM lift_sets ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return {"sets": [dict(r) for r in rows]}


@app.get("/api/trinkets")
def trinket_catalog():
    return {"trinkets": {k: {kk: vv for kk, vv in v.items() if kk != "effect"} for k, v in items.TRINKETS.items()}}


@app.get("/api/items")
def item_catalog():
    return {"items": {
        k: {kk: vv for kk, vv in v.items() if kk != "effect"}
        for k, v in items.ITEMS.items()
    }}


@app.get("/api/exercises")
def exercise_list():
    return {"exercises": [
        {"name": k, **{kk: vv for kk, vv in v.items() if kk != "scheme"}}
        for k, v in exercises.EXERCISES.items()
    ]}


# ---------------- stats / calendar / amendments ----------------

@app.get("/api/stats")
def stats(wellness_days: int = 180):
    return game.stats_payload(wellness_days)


@app.get("/api/calendar")
def calendar(year: int, month: int):
    if not (1 <= month <= 12 and 2000 <= year <= 2100):
        raise ValueError("The calendar does not stretch that far.")
    return game.calendar_payload(year, month)


@app.get("/api/day/{dstr}")
def day_detail(dstr: str):
    return game.day_payload(dstr)


@app.delete("/api/activities/{aid}")
def delete_activity(aid: str):
    row = db.q("SELECT name FROM activities WHERE id=?", (aid,)).fetchone()
    if not row:
        raise ValueError("No such entry in the ledger.")
    db.q("DELETE FROM activities WHERE id=?", (aid,))
    db.commit()
    db.log_event(game.now_iso(), "amend", f"Wick struck '{row['name'] or aid}' from the record.")
    return {"ok": True}


@app.delete("/api/lifts/day/{dstr}")
def delete_lift_day(dstr: str):
    n = db.q("SELECT COUNT(*) AS n FROM lift_sets WHERE ts LIKE ?", (dstr + "%",)).fetchone()["n"]
    if not n:
        raise ValueError("No sets recorded that day.")
    db.q("DELETE FROM lift_sets WHERE ts LIKE ?", (dstr + "%",))
    db.commit()
    db.log_event(game.now_iso(), "amend", f"Wick struck an entire lifting session ({n} sets) from {dstr}.")
    return {"ok": True, "deleted": n}


@app.delete("/api/lifts/{set_id}")
def delete_lift(set_id: int):
    row = db.q("SELECT exercise FROM lift_sets WHERE id=?", (set_id,)).fetchone()
    if not row:
        raise ValueError("No such set in the ledger.")
    db.q("DELETE FROM lift_sets WHERE id=?", (set_id,))
    db.commit()
    db.log_event(game.now_iso(), "amend", f"Wick struck a set of {row['exercise']} from the record.")
    return {"ok": True}


@app.patch("/api/lifts/{set_id}")
async def edit_lift(set_id: int, request: Request):
    body = await request.json()
    row = db.q("SELECT * FROM lift_sets WHERE id=?", (set_id,)).fetchone()
    if not row:
        raise ValueError("No such set in the ledger.")
    weight = float(body.get("weight", row["weight"]))
    reps = int(body.get("reps", row["reps"]))
    db.q("UPDATE lift_sets SET weight=?, reps=? WHERE id=?", (weight, reps, set_id))
    db.commit()
    db.log_event(game.now_iso(), "amend", f"Wick corrected a set of {row['exercise']}: {weight} x {reps}.")
    return {"ok": True}


# ---------------- menagerie ----------------

@app.get("/api/monsters")
def monster_list():
    cs = monsters.current_series()
    return {
        "monsters": monsters.all_monsters(),
        "pack_cost": monsters.PACK_COST,
        "packs_owned": db.inv_all().get("monster_pack", 0),
        "gold": game.get_char()["gold"],
        "series": cs["name"],
        "series_days_left": cs["days_left"],
    }


@app.post("/api/monsters/rip")
def monster_rip():
    result = monsters.rip_pack()
    return {**result, "character": game.get_char()}


@app.post("/api/monsters/{mid}/hat")
async def monster_hat(mid: int, request: Request):
    body = await request.json()
    return monsters.set_hat(mid, body.get("hat_id") or None)


@app.post("/api/monsters/{mid}/buddy")
def monster_buddy(mid: int):
    return monsters.toggle_buddy(mid)


@app.delete("/api/monsters/{mid}")
def monster_free(mid: int):
    return monsters.set_free(mid)


# ---------------- the colosseum ----------------

@app.get("/api/colosseum/{kind}")
def colosseum_field(kind: str):
    return colosseum.preview_field(kind)


@app.post("/api/colosseum/{kind}/enter")
async def colosseum_enter(kind: str, request: Request):
    body = await request.json()
    return colosseum.enter(kind, int(body.get("contestant", 0)), body.get("wager", 10))


# ---------------- dev mode ----------------

@app.post("/api/dev")
async def dev_action(request: Request):
    if not game.get_settings().get("dev_mode"):
        raise ValueError("Dev mode is not enabled. (Settings scroll, bottom.)")
    body = await request.json()
    act = body.get("action")
    c = game.get_char()
    if act == "gold":
        c["gold"] += 1000
        game.save_char(c)
    elif act == "tokens":
        c["tokens"] += 10
        game.save_char(c)
    elif act == "vigor":
        c["vigor"] = 10
        game.save_char(c)
    elif act == "packs":
        db.inv_add("monster_pack", 3)
    elif act == "hats":
        for h in ("hat_cone", "hat_top", "hat_crown", "hat_wizard", "hat_halo", "decor_pond", "decor_gnome"):
            db.inv_add(h)
    elif act == "seed":
        import random as _r
        from datetime import timedelta as _td
        rng = _r.Random()
        for i in range(24):
            day = game.now() - _td(days=rng.randint(0, 55))
            kind = rng.random()
            if kind < 0.5:
                t, mins = "Run", rng.randint(18, 45)
            elif kind < 0.7:
                t, mins = "RockClimbing", rng.randint(60, 120)
            elif kind < 0.9:
                t, mins = "WeightTraining", rng.randint(30, 60)
            else:
                t, mins = "Yoga", rng.randint(15, 40)
            intervals.add_manual_activity({
                "type": t, "minutes": mins, "km": round(mins / 6, 1) if t == "Run" else 0,
                "name": f"dev {t.lower()} {i}", "source": "dev",
                "start": day.isoformat(timespec="seconds"),
            })
        base_hrv, base_rhr = rng.uniform(55, 85), rng.uniform(48, 60)
        for i in range(90):
            day = (game.now() - _td(days=i)).date().isoformat()
            # OR IGNORE: seeding only ever fills EMPTY dates. A real synced
            # wellness row must never be overwritten by dev data — this
            # exact overwrite corrupted ~59 days of live data once.
            db.q("INSERT OR IGNORE INTO wellness (date, hrv, resting_hr, vo2max, weight, sleep_secs, ctl, atl, readiness) VALUES (?,?,?,?,?,?,?,?,?)",
                 (day, base_hrv + rng.uniform(-8, 8), base_rhr + rng.uniform(-3, 3),
                  44 + rng.uniform(-1, 1) + (90 - i) * 0.01, 78 + rng.uniform(-1, 1),
                  rng.uniform(6, 8.5) * 3600, 40 + (90 - i) * 0.15, 40 + rng.uniform(-8, 8), None))
        db.commit()
        game.invalidate_offers()
    elif act == "bad_recovery":
        # Seed a wellness picture that trips the Rest Writ: ~5 weeks of a
        # healthy baseline, then a rough last week (HRV down, RHR up, short
        # sleep). OR IGNORE like "seed": only fills empty dates, so it's for
        # FRESH scratch profiles — it will no-op wherever real data exists.
        import random as _r
        from datetime import timedelta as _td
        rng = _r.Random()
        for i in range(42):
            day = (game.now() - _td(days=i)).date().isoformat()
            rough = i < 7
            hrv = rng.uniform(58, 64) if rough else rng.uniform(72, 80)
            rhr = rng.uniform(57, 60) if rough else rng.uniform(50, 53)
            sleep = rng.uniform(5.0, 5.8) if rough else rng.uniform(7.0, 8.0)
            db.q("INSERT OR IGNORE INTO wellness (date, hrv, resting_hr, vo2max, weight, sleep_secs, ctl, atl, readiness) VALUES (?,?,?,?,?,?,?,?,?)",
                 (day, hrv, rhr, 44.0, 78.0, sleep * 3600, 45.0, 50.0, None))
        db.commit()
        game.invalidate_offers()  # Elowen re-reads the omens
    elif act == "wipe_dev":
        db.q("DELETE FROM activities WHERE source='dev'")
        db.commit()
        game.invalidate_offers()
    elif act == "almanac_bang":
        db.kv_del("almanac_seen")
    elif act == "unguided_run":
        import random as _r
        mins = _r.randint(18, 32)
        intervals.add_manual_activity({
            "type": "Run", "minutes": mins, "km": round(mins / 6, 1),
            "name": "dev unguided run", "source": "intervals.icu",
        })
        game.grant_unguided_run_bonus()
    else:
        raise ValueError("Unknown dev incantation.")
    db.log_event(game.now_iso(), "dev", f"Dev mode: {act}.")
    return {"ok": True, "character": game.get_char()}


@app.post("/api/claim")
async def claim(request: Request):
    body = await request.json()
    rewards = game.claim_deed(body.get("kind"), body.get("minutes", 30), body.get("note", ""))
    return {"rewards": rewards, "character": game.get_char()}


@app.get("/api/claim/types")
def claim_types():
    return {"types": [{"kind": k, **v} for k, v in game.CLAIM_TYPES.items()]}


# ---------------- doctrines (programs & routines) ----------------

@app.get("/api/programs")
def program_list():
    return {
        "programs": [{"key": k, **{kk: vv for kk, vv in v.items() if kk != "inc"}} for k, v in programs.PROGRAMS.items()],
        "routines": programs.get_routines(),
        "active": {g: programs.active_program(g) for g in ("kettlebell", "strength")},
    }


@app.post("/api/programs/select")
async def program_select(request: Request):
    body = await request.json()
    programs.select_program(body["giver"], body.get("key") or None)
    return {"ok": True}


@app.post("/api/routines")
async def routine_create(request: Request):
    body = await request.json()
    return {"routine": programs.save_routine(body)}


@app.delete("/api/routines/{rid}")
def routine_delete(rid: str):
    programs.delete_routine(rid)
    return {"ok": True}


@app.get("/api/chronicle")
def chronicle():
    return {"events": game.chronicle()}


# ---------------- economy ----------------

@app.post("/api/gacha")
async def gacha(request: Request):
    body = await request.json()
    it = game.crank(use_token=bool(body.get("use_token")))
    return {"item": it, "character": game.get_char(), "cost_gold": items.GACHA_COST_GOLD}


def _inventory():
    inv = db.inv_all()
    return [{**items.get(iid), "qty": qty} for iid, qty in sorted(inv.items())]


@app.get("/api/inventory")
def inventory():
    return {"items": _inventory()}


# ---------------- dungeon ----------------

@app.get("/api/dungeon")
def dungeon_state():
    return {"state": dungeon.get_state(), "stats": dungeon.player_stats(),
            "resume_floor": db.kv_get("resume_floor", 1),
            "enter_cost": dungeon.ENTER_COST, "vigor": game.get_char()["vigor"]}


@app.post("/api/dungeon/enter")
def dungeon_enter():
    d = dungeon.enter()
    return {"state": d, "stats": dungeon.player_stats()}


@app.post("/api/dungeon/action")
async def dungeon_action(request: Request):
    body = await request.json()
    result = dungeon.action(body)
    result["stats"] = dungeon.player_stats()
    result["character"] = game.get_char()
    return result


# ---------------- static frontend ----------------

@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"))


app.mount("/static", StaticFiles(directory=STATIC), name="static")
