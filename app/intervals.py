"""intervals.icu integration.

intervals.icu uses HTTP Basic auth with username 'API_KEY' and your personal
API key as the password (Settings -> Developer on intervals.icu). Because
intervals.icu itself syncs from Strava / Garmin / Polar etc., connecting it
here covers those sources too.

First sync pulls ~400 days of history (activities + wellness) so quest sizing
and progress charts work from day one; later syncs pull a rolling 30 days.
A background task in main.py re-syncs every 15 minutes.
"""
import uuid
from datetime import datetime, timedelta

import httpx

from . import db, game

BASE = "https://intervals.icu/api/v1"


def _creds():
    s = game.get_settings()
    athlete = s.get("intervals_athlete_id", "").strip()
    key = s.get("intervals_api_key", "").strip()
    if not athlete or not key:
        raise ValueError("No intervals.icu credentials set. Visit the Settings scroll.")
    return athlete, key


def _get(path, params, athlete, key):
    try:
        r = httpx.get(f"{BASE}{path}", params=params, auth=("API_KEY", key), timeout=45)
        r.raise_for_status()
        return r.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise ValueError("intervals.icu refused the key. Check athlete ID and API key.")
        raise ValueError(f"intervals.icu error: {e.response.status_code}")
    except httpx.HTTPError as e:
        raise ValueError(f"Could not reach intervals.icu: {e.__class__.__name__}")


def sync(days=None):
    athlete, key = _creds()
    first = not db.kv_get("first_sync_done")
    days = days or (400 if first else 30)
    oldest = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    newest = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

    new = 0
    for a in _get(f"/athlete/{athlete}/activities", {"oldest": oldest, "newest": newest}, athlete, key):
        aid = str(a.get("id"))
        exists = db.q("SELECT 1 FROM activities WHERE id=?", (aid,)).fetchone()
        # Garmin's ClimbTime custom field excludes rest/belay time that moving_time/elapsed_time include.
        mt = a.get("ClimbTime") if a.get("type") == "RockClimbing" else None
        mt = mt or a.get("moving_time")
        db.q(
            "INSERT INTO activities (id, source, start, type, name, moving_time, distance, load, avg_hr) "
            "VALUES (?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET moving_time=excluded.moving_time, distance=excluded.distance, "
            "type=excluded.type, name=excluded.name, load=excluded.load, avg_hr=excluded.avg_hr",
            (
                aid, "intervals.icu",
                a.get("start_date_local") or a.get("start_date") or "",
                a.get("type") or "Workout",
                a.get("name"),
                mt,
                a.get("distance"),
                a.get("icu_training_load"),
                a.get("average_heartrate"),
            ),
        )
        if not exists:
            new += 1

    # wellness: HRV, resting HR, VO2max, weight, sleep, fitness (CTL) / fatigue (ATL)
    try:
        wl = _get(f"/athlete/{athlete}/wellness", {"oldest": oldest, "newest": newest}, athlete, key)
    except ValueError:
        wl = []  # activities synced fine; don't fail the whole sync on wellness
    for w in wl or []:
        db.q(
            "INSERT INTO wellness (date, hrv, resting_hr, vo2max, weight, sleep_secs, ctl, atl, readiness) "
            "VALUES (?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(date) DO UPDATE SET hrv=excluded.hrv, resting_hr=excluded.resting_hr, "
            "vo2max=excluded.vo2max, weight=excluded.weight, sleep_secs=excluded.sleep_secs, "
            "ctl=excluded.ctl, atl=excluded.atl, readiness=excluded.readiness",
            (
                w.get("id"),
                w.get("hrv"),
                w.get("restingHR"),
                w.get("vo2max"),
                w.get("weight"),
                w.get("sleepSecs"),
                w.get("ctl"),
                w.get("atl"),
                w.get("readiness"),
            ),
        )

    db.commit()
    db.kv_set("first_sync_done", True)
    db.kv_set("last_sync", game.now_iso())
    if new:
        db.log_event(game.now_iso(), "sync", f"The ravens returned: {new} new deed(s) from intervals.icu.")
        from . import quests  # lazy: quests imports this module for claim activities
        quests.invalidate_offers()  # fresh data should reshape today's quests
    return new


def add_manual_activity(payload):
    """Manual fallback so the game works with no integration at all."""
    aid = "manual-" + uuid.uuid4().hex[:12]
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time, distance) VALUES (?,?,?,?,?,?,?)",
        (
            aid, payload.get("source", "manual"),
            payload.get("start") or game.now_iso(),
            payload.get("type", "Run"),
            payload.get("name", "Manual entry"),
            int(float(payload.get("minutes", 0)) * 60),
            float(payload.get("km", 0) or 0) * 1000,
        ),
    )
    db.commit()
    return aid
