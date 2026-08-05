"""intervals.icu integration.

intervals.icu uses HTTP Basic auth with username 'API_KEY' and your personal
API key as the password (Settings -> Developer on intervals.icu). Because
intervals.icu itself syncs from Strava / Garmin / Polar etc., connecting it
here covers those sources too.

First sync pulls ~400 days of history (activities + wellness) so quest sizing
and progress charts work from day one; later syncs pull a rolling 30 days.
A background task in main.py re-syncs every 15 minutes.
"""
import math
import os
import uuid
from datetime import date, timedelta

import httpx

from . import db, game, sync_status

# Overridable so tests can aim the ravens at a dead port instead of the internet.
BASE = os.environ.get("INTERVALS_BASE_URL", "https://intervals.icu/api/v1")
SYNC_STATUS_KEY = "sync_status"
WELLNESS_INITIAL_SYNC_KEY = "first_wellness_sync_done"
ACTIVITY_SYNC_ERROR = "The activity ledger could not be fetched from intervals.icu."
WELLNESS_SYNC_ERROR = "The wellness ledger could not be fetched from intervals.icu."
ACTIVITY_FIELDS = ("start", "type", "name", "moving_time", "distance", "load", "avg_hr")
WELLNESS_FIELDS = ("hrv", "resting_hr", "vo2max", "weight", "sleep_secs", "ctl", "atl", "readiness")


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


def activity_start(a):
    """Pick the stored `start` string for a synced intervals.icu activity.

    `start_date_local` is the athlete-local timestamp and is trusted verbatim.
    When it's missing, fall back to the UTC `start_date` converted to
    system-local time (see game.utc_to_local_iso) so the activity is bucketed
    on the day it was actually trained rather than the UTC day. An unparseable
    `start_date` is stored verbatim instead of discarded, so a malformed
    payload never blanks a real timestamp.
    """
    slocal = a.get("start_date_local")
    if slocal:
        return slocal
    utc = a.get("start_date")
    conv = game.utc_to_local_iso(utc)
    return conv or utc or ""


def get_sync_status() -> sync_status.SyncStatus:
    return sync_status.normalize(
        db.kv_get(SYNC_STATUS_KEY),
        ACTIVITY_FIELDS,
        WELLNESS_FIELDS,
    )


def _update_sync_status(
    stream: sync_status.StreamName,
    changes,
) -> None:
    status = get_sync_status()
    current = status[stream]
    current.update(changes)
    current["revision"] += 1
    status["revision"] += 1
    db.kv_set(SYNC_STATUS_KEY, status)


def _records(payload, resource):
    if isinstance(payload, list) and all(isinstance(row, dict) for row in payload):
        return payload
    raise ValueError(f"intervals.icu returned malformed {resource} data.")


def _observation_date(value):
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


def _note_fields(field_as_of, observed_on, values):
    if observed_on is None:
        return
    for field, value in values.items():
        if value is not None and (field_as_of[field] is None or observed_on > field_as_of[field]):
            field_as_of[field] = observed_on


def _window(days, initial):
    span = days or (400 if initial else 30)
    current = game.now()
    return {
        "oldest": (current - timedelta(days=span)).strftime("%Y-%m-%d"),
        "newest": (current + timedelta(days=1)).strftime("%Y-%m-%d"),
    }


def sync(days=None):
    athlete, key = _creds()
    activity_initial = not db.kv_get("first_sync_done")
    wellness_initial = not db.kv_get(WELLNESS_INITIAL_SYNC_KEY)
    new = 0
    activity_attempted = game.now_iso()
    try:
        activities = _records(
            _get(f"/athlete/{athlete}/activities", _window(days, activity_initial), athlete, key),
            "activity",
        )
    except ValueError:
        _update_sync_status("activity", {"attempted_at": activity_attempted, "error": ACTIVITY_SYNC_ERROR})
        raise
    activity_newest = None
    activity_as_of = {field: None for field in ACTIVITY_FIELDS}
    for a in activities:
        aid = str(a.get("id"))
        exists = db.q("SELECT 1 FROM activities WHERE id=?", (aid,)).fetchone()
        mt = a.get("ClimbTime") if a.get("type") == "RockClimbing" else None
        mt = mt or a.get("moving_time")
        start = activity_start(a)
        activity_values = {
            "start": start,
            "type": a.get("type") or "Workout",
            "name": a.get("name"),
            "moving_time": mt,
            "distance": a.get("distance"),
            "load": a.get("icu_training_load"),
            "avg_hr": a.get("average_heartrate"),
        }
        observed_on = _observation_date(start)
        if observed_on is not None and (activity_newest is None or observed_on > activity_newest):
            activity_newest = observed_on
        _note_fields(activity_as_of, observed_on, activity_values)
        db.q(
            "INSERT INTO activities (id, source, start, type, name, moving_time, distance, load, avg_hr) "
            "VALUES (?,?,?,?,?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET start=excluded.start, "
            "moving_time=excluded.moving_time, distance=excluded.distance, "
            "type=excluded.type, name=excluded.name, load=excluded.load, avg_hr=excluded.avg_hr",
            (aid, "intervals.icu", *(activity_values[field] for field in ACTIVITY_FIELDS)),
        )
        if not exists:
            new += 1
    db.commit()
    _update_sync_status(
        "activity",
        {
            "attempted_at": activity_attempted,
            "succeeded_at": game.now_iso(),
            "newest_observation_date": activity_newest,
            "field_as_of": activity_as_of,
            "error": None,
        },
    )
    db.kv_set("first_sync_done", True)

    wellness_attempted = game.now_iso()
    try:
        wellness = _records(
            _get(f"/athlete/{athlete}/wellness", _window(days, wellness_initial), athlete, key),
            "wellness",
        )
        dated_wellness = []
        for record in wellness:
            observed_on = _observation_date(record.get("id"))
            if observed_on is None:
                raise ValueError("intervals.icu returned wellness data without a valid date.")
            dated_wellness.append((record, observed_on))
    except ValueError:
        _update_sync_status("wellness", {"attempted_at": wellness_attempted, "error": WELLNESS_SYNC_ERROR})
    else:
        wellness_newest = None
        wellness_as_of = {field: None for field in WELLNESS_FIELDS}
        for w, observed_on in dated_wellness:
            wellness_values = {
                "hrv": w.get("hrv"),
                "resting_hr": w.get("restingHR"),
                "vo2max": w.get("vo2max"),
                "weight": w.get("weight"),
                "sleep_secs": w.get("sleepSecs"),
                "ctl": w.get("ctl"),
                "atl": w.get("atl"),
                "readiness": w.get("readiness"),
            }
            if wellness_newest is None or observed_on > wellness_newest:
                wellness_newest = observed_on
            _note_fields(wellness_as_of, observed_on, wellness_values)
            db.q(
                "INSERT INTO wellness (date, hrv, resting_hr, vo2max, weight, sleep_secs, ctl, atl, readiness) "
                "VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(date) DO UPDATE SET hrv=excluded.hrv, resting_hr=excluded.resting_hr, "
                "vo2max=excluded.vo2max, weight=excluded.weight, sleep_secs=excluded.sleep_secs, "
                "ctl=excluded.ctl, atl=excluded.atl, readiness=excluded.readiness",
                (observed_on, *(wellness_values[field] for field in WELLNESS_FIELDS)),
            )
        db.commit()
        _update_sync_status(
            "wellness",
            {
                "attempted_at": wellness_attempted,
                "succeeded_at": game.now_iso(),
                "newest_observation_date": wellness_newest,
                "field_as_of": wellness_as_of,
                "error": None,
            },
        )
        db.kv_set(WELLNESS_INITIAL_SYNC_KEY, True)
    db.kv_set("last_sync", game.now_iso())
    if new:
        db.log_event(game.now_iso(), "sync", f"The ravens returned: {new} new deed(s) from intervals.icu.")
        from . import quests  # lazy: quests imports this module for claim activities
        quests.invalidate_offers()  # fresh data should reshape today's quests
    return new


def _manual_measure(value, scale, label):
    try:
        amount = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"Record the deed's {label} as a finite, non-negative number.",
        ) from error
    scaled = amount * scale
    if isinstance(value, bool) or amount < 0 or not math.isfinite(scaled):
        raise ValueError(
            f"Record the deed's {label} as a finite, non-negative number.",
        )
    return scaled


def add_manual_activity(payload):
    """Manual fallback so the game works with no integration at all."""
    moving_time = int(_manual_measure(payload.get("minutes", 0), 60, "minutes"))
    distance = _manual_measure(payload.get("km", 0), 1000, "distance")
    aid = "manual-" + uuid.uuid4().hex[:12]
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time, distance) VALUES (?,?,?,?,?,?,?)",
        (
            aid, payload.get("source", "manual"),
            payload.get("start") or game.now_iso(),
            payload.get("type", "Run"),
            payload.get("name", "Manual entry"),
            moving_time,
            distance,
        ),
    )
    db.commit()
    return aid
