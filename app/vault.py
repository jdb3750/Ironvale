"""The Vault: nightly snapshots of the realm's living data.

Once per UTC day, the background loop copies every profile database (via
SQLite's own backup API — safe against mid-write, unlike copying the file)
plus the shared realm JSONs into data/backups/<YYYY-MM-DD>/, and prunes
snapshot folders older than KEEP_DAYS. This covers the realistic risk class
for a self-hosted save — a bad migration, a buggy write, an accidental
deletion — with zero configuration. It is the floor, not the ceiling:
off-volume host backups are still recommended (see skill iron-vale-ops).

Stateless by design: "already ran today" is simply "today's folder exists",
so there is no marker to corrupt and a restart never double-runs it.
"""
import glob
import os
import re
import shutil
import sqlite3
from datetime import datetime, timezone

from . import db

KEEP_DAYS = 14
SHARED_JSON = ("raid.json", "realm.json", "profiles.json")
_DATE_DIR = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _backups_root():
    return os.path.join(db.DATA_DIR, "backups")


def snapshot_if_due(now=None):
    """Run at most once per UTC day; returns the snapshot dir when it ran,
    None when today's vault already exists. Never raises — a failed vault
    must not take down the sync loop (callers already guard, but the vault
    guards itself too)."""
    try:
        today = (now or datetime.now(timezone.utc)).date().isoformat()
        dest = os.path.join(_backups_root(), today)
        if os.path.isdir(dest):
            return None
        os.makedirs(dest, exist_ok=True)
        for src in sorted(glob.glob(os.path.join(db.DATA_DIR, "*.db"))):
            _backup_sqlite(src, os.path.join(dest, os.path.basename(src)))
        for name in SHARED_JSON:
            src = os.path.join(db.DATA_DIR, name)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(dest, name))
        _prune(keep=KEEP_DAYS)
        print(f"[vault] realm snapshot sealed: {dest}")
        return dest
    except Exception as e:  # noqa: BLE001 — the vault must never sink the loop
        print(f"[vault] snapshot failed: {e}")
        return None


def _backup_sqlite(src_path, dest_path):
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dest_path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _prune(keep):
    """Remove snapshot folders older than `keep` days. Only directories whose
    name is exactly a YYYY-MM-DD date are ever touched — anything else in
    backups/ is somebody's manual copy and none of our business."""
    root = _backups_root()
    if not os.path.isdir(root):
        return
    dated = sorted(d for d in os.listdir(root)
                   if _DATE_DIR.match(d) and os.path.isdir(os.path.join(root, d)))
    for stale in dated[:-keep] if keep else dated:
        shutil.rmtree(os.path.join(root, stale), ignore_errors=True)
