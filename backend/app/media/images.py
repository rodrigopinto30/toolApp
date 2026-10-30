import asyncio
import io
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from PIL import Image, ImageOps

from app.core.exceptions import BusinessRuleViolation
from app.media.paths import IMAGE_WIDTHS

ACCEPTED_FORMATS = ("JPEG", "PNG", "WEBP")
MAX_IMAGE_PIXELS = 25_000_000
WEBP_QUALITY = 82
DECODE_SIZE = (2 * max(IMAGE_WIDTHS), 2 * max(IMAGE_WIDTHS))

_DECODE_ERRORS = (OSError, ValueError, SyntaxError, EOFError, Image.DecompressionBombError)
_WORKER = ThreadPoolExecutor(max_workers=1, thread_name_prefix="images")


@dataclass(frozen=True)
class ProcessedImage:
    files: dict[int, bytes]
    width: int
    height: int


def _invalid_image() -> BusinessRuleViolation:
    return BusinessRuleViolation("The file is not a valid image.", code="invalid_image")


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data), formats=ACCEPTED_FORMATS)


def _decode(data: bytes) -> Image.Image:
    with _open(data) as probe:
        width, height = probe.size
        if width * height > MAX_IMAGE_PIXELS:
            raise _invalid_image()
        probe.verify()
    image = _open(data)
    image.draft(None, DECODE_SIZE)
    image.load()
    return image


def _normalized(image: Image.Image) -> Image.Image:
    ImageOps.exif_transpose(image, in_place=True)
    has_alpha = image.mode in ("RGBA", "LA", "PA") or "transparency" in image.info
    mode = "RGBA" if has_alpha else "RGB"
    return image if image.mode == mode else image.convert(mode)


def _resized(image: Image.Image, width: int) -> Image.Image:
    if width >= image.width:
        return image
    height = max(round(image.height * width / image.width), 1)
    return image.resize((width, height), Image.Resampling.LANCZOS)


def _encoded(image: Image.Image) -> bytes:
    image.info.clear()
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
    return buffer.getvalue()


def encode_image(data: bytes) -> ProcessedImage:
    try:
        image = _normalized(_decode(data))
    except _DECODE_ERRORS as exc:
        raise _invalid_image() from exc
    files: dict[int, bytes] = {}
    size: tuple[int, int] | None = None
    for width in sorted(IMAGE_WIDTHS, reverse=True):
        image = _resized(image, width)
        size = size or image.size
        files[width] = _encoded(image)
    return ProcessedImage(files=files, width=size[0], height=size[1])


async def process_image(data: bytes) -> ProcessedImage:
    return await asyncio.get_running_loop().run_in_executor(_WORKER, encode_image, data)
