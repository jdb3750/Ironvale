"""One complete intervals.icu flight for a routed adventurer profile."""

from . import db, game, intervals, quests, raid

ERROR_KEY = "last_sync_error"


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
