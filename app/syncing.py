"""One complete intervals.icu flight for a routed adventurer profile."""

from datetime import date, datetime, timedelta

from . import db, game, intervals, quests, raid

ERROR_KEY = "last_sync_error"


def wellness_freshness(wellness=None):
    if wellness is None:
        wellness = intervals.get_sync_status()["wellness"]
    if not isinstance(wellness, dict):
        return "missing"
    succeeded_value = wellness.get("succeeded_at")
    field_as_of = wellness.get("field_as_of")
    if not isinstance(succeeded_value, str) or not isinstance(field_as_of, dict):
        return "missing"
    try:
        succeeded_at = datetime.fromisoformat(succeeded_value.replace("Z", "+00:00"))
    except ValueError:
        return "missing"
    observations = []
    for value in field_as_of.values():
        if not isinstance(value, str):
            continue
        try:
            observations.append(date.fromisoformat(value))
        except ValueError:
            continue
    if not observations:
        return "missing"
    current = game.now()
    if succeeded_at.tzinfo is None:
        succeeded_at = succeeded_at.replace(tzinfo=game.profile_tz())
    age = current - succeeded_at.astimezone(game.profile_tz())
    fetch_is_recent = timedelta(0) <= age <= timedelta(hours=48)
    observation_is_recent = max(observations) >= current.date() - timedelta(days=2)
    return "fresh" if fetch_is_recent and observation_is_recent else "stale"


def get_sync_status():
    status = intervals.get_sync_status()
    status["wellness"]["freshness"] = wellness_freshness(status["wellness"])
    return status


def _record_failure(slug, message, error_name, scope):
    db.kv_set(
        ERROR_KEY,
        {"at": game.now_iso(), "message": message, "scope": scope},
    )
    print("[sync] profile flight failed", {"profile": slug, "error": error_name})


def _clear_failure(scope):
    failure = db.kv_get(ERROR_KEY)
    if failure is not None and (
        scope == "linked_sync" or failure.get("scope") == "maintenance"
    ):
        db.kv_del(ERROR_KEY)


def _sync_profile(slug, fetch_intervals):
    scope = "linked_sync" if fetch_intervals else "maintenance"
    try:
        new = 0
        completed = []
        if fetch_intervals:
            new = intervals.sync()
            quests.reconcile_honor_completions(slug)
            completed = quests.auto_complete_ready()
            quests.grant_unguided_run_bonus()
        quests.resolve_rest_writs()
        damage = raid.apply_damage(slug)
    except ValueError as error:
        _record_failure(slug, str(error), error.__class__.__name__, scope)
        raise
    except Exception as error:  # noqa: BLE001 — status boundary logs and re-raises
        message = f"The ravens were lost before they finished their rounds ({error.__class__.__name__})."
        _record_failure(slug, message, error.__class__.__name__, scope)
        raise
    _clear_failure(scope)
    return {"new_activities": new, "completed": completed, "raid_damage": damage}


def sync_linked_profile(slug):
    """Fetch intervals.icu and apply every resulting game-side consequence."""
    # An unlinked profile is a configuration gap, not a failed flight: guide
    # the player without recording a durable failure only linking could clear.
    intervals._creds()
    return _sync_profile(slug, fetch_intervals=True)


def maintain_profile(slug):
    """Run a scheduled flight, skipping the remote fetch when no link exists."""
    settings = game.get_settings()
    linked = bool(settings["intervals_athlete_id"] and settings["intervals_api_key"])
    return _sync_profile(slug, fetch_intervals=linked)
