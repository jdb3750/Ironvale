"""db.transaction() — the composable-commit boundary.

Seam 11 let callers compose the auto-committing helpers (kv_set, kv_del,
inv_add, inv_remove, and anything built on them such as game.save_char) into
one atomic unit. The dangerous failure mode is the quiet one: a helper that
stops committing for a caller that never opted in, leaving a write that looks
fine in-session and is gone after a restart.

So every durability assertion here reads through a SEPARATE sqlite3
connection. Checking the same connection would prove only that the statement
ran, not that it was committed — exactly the "asserts the code ran, not that
it worked" trap AGENTS.md warns about.

Run: .venv/bin/python tests/test_db_transaction.py
"""
import os
import shutil
import sqlite3
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-tx-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db  # noqa: E402

PASS = 0
DB_PATH = os.path.join(SCRATCH, "tx.db")


def ok(label, cond, detail=""):
    global PASS
    assert cond, f"DB TRANSACTION FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


def committed(sql, args=()):
    """Read through a fresh connection: durable state only."""
    other = sqlite3.connect(DB_PATH)
    try:
        return other.execute(sql, args).fetchall()
    finally:
        other.close()


db.set_profile(DB_PATH)
db.conn()  # builds the schema

# ---- callers that never opted in keep today's immediate commit -------------
print("un-composed helpers stay immediate:")
db.kv_set("plain", {"a": 1})
ok("kv_set commits immediately", len(committed("SELECT 1 FROM kv WHERE key='plain'")) == 1)
db.inv_add("plain_item")
ok("inv_add commits immediately",
   len(committed("SELECT 1 FROM inventory WHERE item_id='plain_item'")) == 1)
db.inv_remove("plain_item")
ok("inv_remove commits immediately",
   len(committed("SELECT 1 FROM inventory WHERE item_id='plain_item'")) == 0)
db.kv_del("plain")
ok("kv_del commits immediately", len(committed("SELECT 1 FROM kv WHERE key='plain'")) == 0)

# ---- composed writes land together, or not at all --------------------------
print("composed helpers defer to the block:")
with db.transaction():
    db.kv_set("composed", {"b": 2})
    db.inv_add("composed_item")
    mid_block = len(committed("SELECT 1 FROM kv WHERE key='composed'"))
ok("nothing is durable mid-block", mid_block == 0)
ok("everything commits together at exit",
   len(committed("SELECT 1 FROM kv WHERE key='composed'")) == 1
   and len(committed("SELECT 1 FROM inventory WHERE item_id='composed_item'")) == 1)

raised = None
try:
    with db.transaction():
        db.kv_set("doomed", {"c": 3})
        db.inv_add("doomed_item")
        raise RuntimeError("simulated mid-transaction failure")
except RuntimeError as error:
    raised = str(error)
ok("a failing block re-raises", raised == "simulated mid-transaction failure")
ok("a failing block rolls back every write in it",
   len(committed("SELECT 1 FROM kv WHERE key='doomed'")) == 0
   and len(committed("SELECT 1 FROM inventory WHERE item_id='doomed_item'")) == 0)

# ---- the depth must not leak out of either exit path -----------------------
# If it did, some later unrelated write would silently stop being durable —
# the failure this seam most needed to avoid.
print("transaction depth does not leak:")
db.kv_set("after_failure", {"d": 4})
ok("a helper is immediate again after a FAILED block",
   len(committed("SELECT 1 FROM kv WHERE key='after_failure'")) == 1)

nested = None
try:
    with db.transaction():
        with db.transaction():
            pass
except RuntimeError as error:
    nested = str(error)
ok("nesting is refused rather than silently flattened", nested is not None)
db.kv_set("after_nesting", {"e": 5})
ok("a helper is immediate again after a REFUSED nested block",
   len(committed("SELECT 1 FROM kv WHERE key='after_nesting'")) == 1)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nDB TRANSACTION PASSED — {PASS} checks green")
