import io
from typing import Any

from PIL import Image

EXIF_ORIENTATION = 0x0112


def encoded(
    size: tuple[int, int] = (1600, 1200),
    *,
    format: str = "JPEG",
    mode: str = "RGB",
    color: Any = "red",
    **save: Any,
) -> bytes:
    buffer = io.BytesIO()
    Image.new(mode, size, color).save(buffer, format=format, **save)
    return buffer.getvalue()


def rotated_jpeg(size: tuple[int, int]) -> bytes:
    exif = Image.Exif()
    exif[EXIF_ORIENTATION] = 6
    return encoded(size, exif=exif)


def riff_chunks(data: bytes) -> list[bytes]:
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    chunks, offset = [], 12
    while offset < len(data):
        name, length = data[offset : offset + 4], int.from_bytes(data[offset + 4 : offset + 8], "little")
        chunks.append(name)
        offset += 8 + length + (length % 2)
    return chunks
