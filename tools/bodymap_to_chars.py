#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run tools/bodymap_to_chars.py [PNG_PATH]
# 3. Or make executable and run:
#      chmod +x tools/bodymap_to_chars.py && ./tools/bodymap_to_chars.py [PNG_PATH]
# ──────────────────

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path
from typing import Final


Rgba = tuple[int, int, int, int]

PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"
BYTES_PER_PIXEL: Final = 4
SOURCE_MUSCLES: Final[dict[str, tuple[Rgba, str]]] = {
    "neck": ((0xC6, 0x78, 0xC6, 0xFF), "n"),
    "traps": ((0xE6, 0x78, 0x3C, 0xFF), "t"),
    "shoulders": ((0xF0, 0xC8, 0x3C, 0xFF), "s"),
    "chest": ((0xE4, 0x50, 0x50, 0xFF), "c"),
    "lats": ((0x50, 0xB4, 0xE6, 0xFF), "l"),
    "middle back": ((0x38, 0x78, 0xDC, 0xFF), "m"),
    "lower back": ((0x78, 0x5A, 0xC8, 0xFF), "r"),
    "biceps": ((0x78, 0xDC, 0x78, 0xFF), "b"),
    "triceps": ((0x38, 0xA0, 0x5A, 0xFF), "i"),
    "forearms": ((0xB4, 0xF0, 0x8C, 0xFF), "f"),
    "abdominals": ((0xF0, 0x96, 0x5A, 0xFF), "a"),
    "quadriceps": ((0xFA, 0xF0, 0x78, 0xFF), "q"),
    "hamstrings": ((0xC8, 0x50, 0x8C, 0xFF), "h"),
    "glutes": ((0xF0, 0x78, 0xAA, 0xFF), "g"),
    "adductors": ((0x96, 0xDC, 0xC8, 0xFF), "d"),
    "abductors": ((0x5A, 0xC8, 0xB4, 0xFF), "u"),
    "calves": ((0xA0, 0x96, 0xF0, 0xFF), "v"),
}
SOURCE_CHARACTERS: Final[dict[Rgba, str]] = {
    (0x00, 0x00, 0x00, 0x00): ".",
    (0x27, 0x27, 0x35, 0xFF): "#",
    **{rgba: character for rgba, character in SOURCE_MUSCLES.values()},
}


class BodyMapConversionError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)

    def __str__(self) -> str:
        return self.message


def _png_chunks(data: bytes) -> list[tuple[bytes, bytes]]:
    if not data.startswith(PNG_SIGNATURE):
        raise BodyMapConversionError("input is not a PNG file")
    chunks: list[tuple[bytes, bytes]] = []
    offset = len(PNG_SIGNATURE)
    while offset < len(data):
        if offset + 12 > len(data):
            raise BodyMapConversionError("PNG ends inside a chunk header")
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        end = offset + 12 + length
        if end > len(data):
            raise BodyMapConversionError("PNG ends inside a chunk payload")
        chunks.append((data[offset + 4 : offset + 8], data[offset + 8 : offset + 8 + length]))
        offset = end
    return chunks


def _paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    left_distance = abs(estimate - left)
    above_distance = abs(estimate - above)
    upper_left_distance = abs(estimate - upper_left)
    if left_distance <= above_distance and left_distance <= upper_left_distance:
        return left
    if above_distance <= upper_left_distance:
        return above
    return upper_left


def _reconstruct_byte(
    filter_type: int,
    value: int,
    neighbors: tuple[int, int, int],
) -> int:
    left, above, upper_left = neighbors
    if filter_type == 0:
        return value
    if filter_type == 1:
        return (value + left) & 0xFF
    if filter_type == 2:
        return (value + above) & 0xFF
    if filter_type == 3:
        return (value + ((left + above) // 2)) & 0xFF
    if filter_type == 4:
        return (value + _paeth(left, above, upper_left)) & 0xFF
    raise BodyMapConversionError(f"unsupported PNG filter type {filter_type}")


def _read_rgba_png(path: Path) -> tuple[int, int, bytes]:
    chunks = _png_chunks(path.read_bytes())
    ihdr = next((payload for kind, payload in chunks if kind == b"IHDR"), None)
    if ihdr is None or len(ihdr) != 13:
        raise BodyMapConversionError("PNG has no valid IHDR chunk")
    width, height, bit_depth, color_type, compression, filtering, interlace = struct.unpack(
        ">IIBBBBB", ihdr
    )
    if (bit_depth, color_type, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise BodyMapConversionError("expected a non-interlaced 8-bit RGBA PNG")

    compressed = b"".join(payload for kind, payload in chunks if kind == b"IDAT")
    if not compressed:
        raise BodyMapConversionError("PNG has no image data")
    filtered = zlib.decompress(compressed)
    stride = width * BYTES_PER_PIXEL
    expected_length = height * (stride + 1)
    if len(filtered) != expected_length:
        raise BodyMapConversionError(
            f"decoded PNG has {len(filtered)} bytes; expected {expected_length}"
        )

    pixels = bytearray(height * stride)
    for y in range(height):
        row_start = y * (stride + 1)
        filter_type = filtered[row_start]
        for x in range(stride):
            source = filtered[row_start + 1 + x]
            target = y * stride + x
            left = pixels[target - BYTES_PER_PIXEL] if x >= BYTES_PER_PIXEL else 0
            above = pixels[target - stride] if y > 0 else 0
            upper_left = (
                pixels[target - stride - BYTES_PER_PIXEL]
                if y > 0 and x >= BYTES_PER_PIXEL
                else 0
            )
            pixels[target] = _reconstruct_byte(filter_type, source, (left, above, upper_left))
    return width, height, bytes(pixels)


def convert(path: Path) -> str:
    width, height, pixels = _read_rgba_png(path)
    rows: list[str] = []
    for y in range(height):
        row: list[str] = []
        for x in range(width):
            offset = (y * width + x) * BYTES_PER_PIXEL
            rgba: Rgba = (
                pixels[offset],
                pixels[offset + 1],
                pixels[offset + 2],
                pixels[offset + 3],
            )
            character = SOURCE_CHARACTERS.get(rgba)
            if character is None:
                color = "#" + "".join(f"{channel:02x}" for channel in rgba)
                raise BodyMapConversionError(f"unrecognised colour {color} at ({x}, {y})")
            row.append(character)
        rows.append("".join(row))
    rendered_rows = "\n".join(f"  '{row}'," for row in rows)
    return f"const MUSCLE_MAP_ROWS = [\n{rendered_rows}\n];\n"


def main() -> None:
    default_path = Path(__file__).resolve().parent.parent / "assets" / "templates" / "body.png"
    if len(sys.argv) > 2:
        raise BodyMapConversionError("usage: bodymap_to_chars.py [PNG_PATH]")
    path = Path(sys.argv[1]) if len(sys.argv) == 2 else default_path
    sys.stdout.write(convert(path))


if __name__ == "__main__":
    main()
