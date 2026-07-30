"""The Vault: nightly snapshots of the realm's living data.

Once per UTC day, the background loop copies every profile database (via
SQLite's own backup API — safe against mid-write, unlike copying the file)
plus the shared realm JSONs into data/backups/<YYYY-MM-DD>/, and prunes
snapshot folders older than KEEP_DAYS. This covers the realistic risk class
for a self-hosted save — a bad migration, a buggy write, an accidental
deletion — with zero configuration. It is the floor, not the ceiling:
off-volume host backups are still recommended (see skill iron-vale-ops).

Stateless by design: a dated folder exists only after every copy succeeds.
Work is sealed in a sibling `.incomplete` directory and atomically published,
so an interruption never makes a partial snapshot look complete.
"""
import glob
import os
import re
import shutil
import sqlite3
import threading
from datetime import datetime, timezone

from . import db

KEEP_DAYS = 14
SHARED_JSON = ("raid.json", "realm.json", "profiles.json")
_DATE_DIR = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_snapshot_lock = threading.Lock()
_GIVER_KEY_MIGRATION_SNAPSHOT = "giver-key-migration-v1"


def _backups_root():
    return os.path.join(db.DATA_DIR, "backups")


def _seal_snapshot(now=None):
    today = (now or datetime.now(timezone.utc)).date().isoformat()
    root = _backups_root()
    dest = os.path.join(root, today)
    staging = dest + ".incomplete"
    with _snapshot_lock:
        if os.path.isdir(dest):
            return dest, False
        try:
            os.makedirs(root, exist_ok=True)
            if os.path.isdir(staging):
                shutil.rmtree(staging)
            os.makedirs(staging)
            for src in sorted(glob.glob(os.path.join(db.DATA_DIR, "*.db"))):
                _backup_sqlite(src, os.path.join(staging, os.path.basename(src)))
            for name in SHARED_JSON:
                src = os.path.join(db.DATA_DIR, name)
                if os.path.exists(src):
                    shutil.copy2(src, os.path.join(staging, name))
            os.rename(staging, dest)
            _prune(keep=KEEP_DAYS)
            print(f"[vault] realm snapshot sealed: {dest}")
            return dest, True
        finally:
            if os.path.isdir(staging):
                shutil.rmtree(staging, ignore_errors=True)


def snapshot_if_due(now=None):
    """Run at most once per UTC day; returns the snapshot dir when it ran,
    None when today's vault already exists. Swallows the expected IO failure
    classes (OSError, shutil, sqlite3) so a bad disk day cannot take down the
    sync loop; the scheduler guards against anything else."""
    try:
        dest, created = _seal_snapshot(now)
        return dest if created else None
    except (OSError, shutil.Error, sqlite3.Error) as error:
        print(f"[vault] snapshot failed: {error}")
        return None


def ensure_snapshot_before_migration():
    """Seal a dedicated pre-migration realm backup, raising on failure."""
    try:
        daily, _ = _seal_snapshot()
        dest = os.path.join(daily, _GIVER_KEY_MIGRATION_SNAPSHOT)
        staging = dest + ".incomplete"
        with _snapshot_lock:
            if os.path.isdir(dest):
                return dest
            try:
                if os.path.isdir(staging):
                    shutil.rmtree(staging)
                os.makedirs(staging)
                for src in sorted(glob.glob(os.path.join(db.DATA_DIR, "*.db"))):
                    _backup_sqlite(src, os.path.join(staging, os.path.basename(src)))
                for name in SHARED_JSON:
                    src = os.path.join(db.DATA_DIR, name)
                    if os.path.exists(src):
                        shutil.copy2(src, os.path.join(staging, name))
                os.rename(staging, dest)
                return dest
            finally:
                if os.path.isdir(staging):
                    shutil.rmtree(staging, ignore_errors=True)
    except (OSError, shutil.Error, sqlite3.Error) as error:
        raise RuntimeError(
            "The Vault could not seal a backup; the giver-key migration was not run.",
        ) from error


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
