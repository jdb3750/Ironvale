import os
import shutil
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-settings-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


client = TestClient(app)
PASS = 0


def ok(label, condition):
    global PASS
    assert condition, f"COUNSEL SETTINGS FAIL: {label}"
    PASS += 1
    print(f"  ok  {label}")


try:
    bootstrap = client.get("/api/profiles")
    ok("fresh roster is initialized", bootstrap.status_code == 200)

    created = client.post("/api/profiles", json={"name": "Settings Scout", "pin": "1234"})
    ok("new profile is created", created.status_code == 200)

    defaults = client.get("/api/state").json()["settings"]
    ok(
        "new profile defaults to considered with the daily pointer off",
        defaults["counsel_mode"] == "considered"
        and defaults["counsel_nudge_enabled"] is False
        and defaults["counsel_charter"] is None,
    )

    omitted_charter = client.post(
        "/api/settings",
        json={"counsel_mode": "self", "counsel_nudge_enabled": True},
    )
    settings_without_charter = client.get("/api/state").json()["settings"]
    ok(
        "settings accepts an omitted charter",
        omitted_charter.status_code == 200
        and settings_without_charter["counsel_mode"] == "self"
        and settings_without_charter["counsel_nudge_enabled"] is True
        and settings_without_charter["counsel_charter"] is None,
    )

    saved_charter = {"primary": "run", "secondary": ["strength", "climb"]}
    valid_charter = client.post("/api/settings", json={"counsel_charter": saved_charter})
    settings_with_charter = client.get("/api/state").json()["settings"]
    ok(
        "settings persists a ranked live-focus charter",
        valid_charter.status_code == 200 and settings_with_charter["counsel_charter"] == saved_charter,
    )

    invalid_modes = tuple(
        client.post("/api/settings", json={"counsel_mode": mode})
        for mode in ("schedule", "scheduled")
    )
    after_invalid_mode = client.get("/api/state").json()["settings"]
    ok(
        "invalid loop rejects without mutating saved settings",
        all(response.status_code == 400 for response in invalid_modes)
        and after_invalid_mode == settings_with_charter,
    )

    invalid_focus = client.post(
        "/api/settings",
        json={
            "counsel_mode": "considered",
            "counsel_charter": {"primary": "run", "secondary": ["strength", "sprints"]},
        },
    )
    after_invalid_focus = client.get("/api/state").json()["settings"]
    ok(
        "invalid focus rejects the complete request without mutation",
        invalid_focus.status_code == 400 and after_invalid_focus == settings_with_charter,
    )

    cleared = client.post("/api/settings", json={"counsel_charter": None})
    settings_after_clear = client.get("/api/state").json()["settings"]
    ok(
        "an optional charter can be cleared",
        cleared.status_code == 200 and settings_after_clear["counsel_charter"] is None,
    )
finally:
    shutil.rmtree(SCRATCH, ignore_errors=True)


print(f"\n{PASS} council settings checks passed")
