"""programs.save_routine() — the server half of the forge idempotency key.

Seam 10 closed the duplicate-routine defect with a client-supplied key: the
forge draft holds one `client_key` for its lifetime, so retrying after a
partial failure replays the same key instead of minting a second routine.

The frontend harness (tests/frontend_routines.test.mjs) proves the *client*
sends a stable key across a retry — but its fake server implements the dedup
itself, so it cannot prove the real server honours one. Deleting the
implementation in programs.save_routine leaves that suite green. This file is
the other half.

Run: .venv/bin/python tests/test_routine_idempotency.py
"""
import os
import shutil
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-routine-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, programs  # noqa: E402

PASS = 0


def ok(label, cond, detail=""):
    global PASS
    assert cond, f"ROUTINE IDEMPOTENCY FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


def draft(name, client_key=None):
    payload = {
        "name": name,
        "giver": "strength",
        "exercises": [{"exercise": "Ring Row", "sets": 3, "reps": 8}],
    }
    if client_key is not None:
        payload["client_key"] = client_key
    return payload


db.set_profile(os.path.join(SCRATCH, "routines.db"))
db.conn()

# ---- a retried forge must not mint a second routine -----------------------
print("a replayed key is the same routine:")
first = programs.save_routine(draft("Sunrise Rows", "draft-key-1"))
retry = programs.save_routine(draft("Sunrise Rows", "draft-key-1"))
ok("a repeated client_key creates only one routine", len(programs.get_routines()) == 1,
   f"-> {len(programs.get_routines())} routines")
ok("the replay returns the routine that already exists", retry["id"] == first["id"],
   f"-> {retry['id']} vs {first['id']}")
ok("the stored routine carries its key so a later replay still matches",
   programs.get_routines()[0].get("client_key") == "draft-key-1")

# A retry that reaches the server with different *content* under the same key
# is still the same forge — the player edited nothing, the first attempt just
# failed downstream. The key wins over the payload.
programs.save_routine(draft("Sunrise Rows Renamed", "draft-key-1"))
ok("a replayed key does not append even when the payload differs",
   len(programs.get_routines()) == 1)

# ---- every other caller is untouched ---------------------------------------
print("ordinary forging is unchanged:")
programs.save_routine(draft("Second Routine", "draft-key-2"))
ok("a different client_key creates a second routine", len(programs.get_routines()) == 2)

programs.save_routine(draft("Keyless One"))
programs.save_routine(draft("Keyless Two"))
ok("requests with no client_key still create a routine each",
   len(programs.get_routines()) == 4,
   f"-> {len(programs.get_routines())} routines")
ok("a keyless routine stores no key rather than a null one",
   "client_key" not in programs.get_routines()[-1])

# Two keyless forges of the SAME name are two routines: without a key there is
# nothing to recognise a repeat by, and content-dedup was deliberately not
# chosen — a player may legitimately want two identical routines.
programs.save_routine(draft("Twin"))
programs.save_routine(draft("Twin"))
ok("identical keyless forges are not silently merged", len(programs.get_routines()) == 6)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nROUTINE IDEMPOTENCY PASSED — {PASS} checks green")
