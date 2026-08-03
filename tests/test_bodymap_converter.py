from __future__ import annotations

import binascii
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "templates" / "body.png"
CONVERTER = ROOT / "tools" / "bodymap_to_chars.py"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def png_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    chunks: list[tuple[bytes, bytes]] = []
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        payload = data[offset + 8 : offset + 8 + length]
        chunks.append((kind, payload))
        offset += 12 + length
    return chunks


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = binascii.crc32(kind + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def mutate_copy(source: Path, destination: Path) -> None:
    chunks = png_chunks(source.read_bytes())
    filtered = bytearray(zlib.decompress(b"".join(payload for kind, payload in chunks if kind == b"IDAT")))
    filtered[1] ^= 1
    mutated = bytearray(PNG_SIGNATURE)
    idat_written = False
    for kind, payload in chunks:
        if kind == b"IDAT":
            if idat_written:
                continue
            payload = zlib.compress(filtered)
            idat_written = True
        mutated.extend(png_chunk(kind, payload))
    destination.write_bytes(mutated)


success = subprocess.run(
    [sys.executable, CONVERTER, SOURCE],
    check=False,
    capture_output=True,
    text=True,
)
assert success.returncode == 0, success.stderr
assert success.stdout.startswith("const MUSCLE_MAP_ROWS = [\n")
assert success.stdout in (ROOT / "static" / "js" / "pixel.js").read_text()
rows = [line.strip().strip("',") for line in success.stdout.splitlines()[1:-1]]
assert len(rows) == 64
assert {len(row) for row in rows} == {68}

with tempfile.TemporaryDirectory(prefix="iron-vale-bodymap-") as scratch:
    mutated_path = Path(scratch) / "body-unknown.png"
    mutate_copy(SOURCE, mutated_path)
    failure = subprocess.run(
        [sys.executable, CONVERTER, mutated_path],
        check=False,
        capture_output=True,
        text=True,
    )

assert failure.returncode != 0
assert "unrecognised colour" in failure.stderr
print("BODY MAP CONVERTER PASSED — source converted and unknown colour rejected")
