import io
from pathlib import Path

import pytest
from PIL import Image

from app.core.exceptions import BusinessRuleViolation
from app.media.images import MAX_IMAGE_PIXELS, encode_image, process_image
from app.media.paths import IMAGE_WIDTHS, media_url, variant_paths
from app.media.storage import LocalImageStorage
from tests.images import encoded, riff_chunks, rotated_jpeg

METADATA_CHUNKS = {b"EXIF", b"XMP ", b"ICCP"}


def opened(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


@pytest.mark.parametrize(
    "source",
    [
        encoded(format="JPEG"),
        encoded(format="PNG"),
        encoded(format="WEBP"),
    ],
    ids=["jpeg", "png", "webp"],
)
def test_every_format_becomes_webp_at_the_four_widths(source: bytes) -> None:
    image = encode_image(source)

    assert sorted(image.files) == sorted(IMAGE_WIDTHS)
    for width, data in image.files.items():
        with opened(data) as result:
            assert result.format == "WEBP"
            assert result.size == (width, width * 3 // 4)
    assert (image.width, image.height) == (1280, 960)


def test_an_image_is_never_enlarged() -> None:
    image = encode_image(encoded((500, 250)))

    sizes = {width: opened(data).size for width, data in image.files.items()}
    assert sizes == {320: (320, 160), 640: (500, 250), 960: (500, 250), 1280: (500, 250)}
    assert (image.width, image.height) == (500, 250)


def test_a_large_jpeg_keeps_its_proportions() -> None:
    image = encode_image(encoded((6000, 4000), quality=60))

    assert (image.width, image.height) == (1280, 853)
    with opened(image.files[320]) as result:
        assert result.width == 320
        assert abs(result.height - 213) <= 1


def test_transparency_survives() -> None:
    source = encoded((400, 400), format="PNG", mode="RGBA", color=(255, 0, 0, 0))

    with opened(encode_image(source).files[320]) as result:
        assert result.mode == "RGBA"
        assert result.getpixel((10, 10))[3] == 0


def test_a_palette_with_transparency_is_kept() -> None:
    source = encoded((100, 100), format="PNG", mode="P", color=0, transparency=0)

    with opened(encode_image(source).files[320]) as result:
        assert result.mode == "RGBA"


def test_a_cmyk_jpeg_is_converted() -> None:
    source = encoded((100, 100), mode="CMYK", color=(0, 0, 0, 0))

    with opened(encode_image(source).files[320]) as result:
        assert result.mode == "RGB"


def test_the_exif_orientation_is_applied() -> None:
    image = encode_image(rotated_jpeg((800, 400)))

    assert (image.width, image.height) == (400, 800)


def test_every_metadata_block_is_dropped() -> None:
    exif = Image.Exif()
    exif[0x010F] = "Secret Camera"
    source = encoded(
        (800, 600),
        exif=exif,
        icc_profile=b"profile" * 20,
        comment=b"private note",
    )
    assert b"Secret Camera" in source

    for data in encode_image(source).files.values():
        assert METADATA_CHUNKS.isdisjoint(riff_chunks(data))
        assert b"Secret Camera" not in data
        assert b"private note" not in data


def test_metadata_is_dropped_from_a_webp_source_too() -> None:
    exif = Image.Exif()
    exif[0x010F] = "Secret Camera"
    source = encoded((800, 600), format="WEBP", exif=exif, xmp=b"<x:xmpmeta/>")

    for data in encode_image(source).files.values():
        assert METADATA_CHUNKS.isdisjoint(riff_chunks(data))


@pytest.mark.parametrize(
    "source",
    [
        b"",
        b"this is plain text with a .png name",
        b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        encoded((50, 50), format="GIF"),
        encoded((50, 50), format="BMP"),
        encoded((400, 400))[:300],
    ],
    ids=["empty", "text", "svg", "gif", "bmp", "truncated"],
)
def test_anything_else_is_rejected(source: bytes) -> None:
    with pytest.raises(BusinessRuleViolation) as caught:
        encode_image(source)

    assert caught.value.code == "invalid_image"


def test_a_decompression_bomb_is_rejected_before_decoding() -> None:
    side = int(MAX_IMAGE_PIXELS**0.5) + 1
    source = encoded((side, side), format="PNG", mode="1", color=0)
    assert len(source) < 100_000

    with pytest.raises(BusinessRuleViolation) as caught:
        encode_image(source)

    assert caught.value.code == "invalid_image"


async def test_processing_runs_outside_the_event_loop() -> None:
    image = await process_image(encoded((100, 100)))

    assert (image.width, image.height) == (100, 100)


async def test_rejections_reach_the_caller_from_the_worker() -> None:
    with pytest.raises(BusinessRuleViolation):
        await process_image(b"nope")


def test_media_url() -> None:
    assert media_url("products/1/a-1280.webp") == "/media/products/1/a-1280.webp"
    assert media_url(None) is None


def test_variant_paths() -> None:
    assert variant_paths("products/1/abc-1280.webp") == [
        f"products/1/abc-{width}.webp" for width in IMAGE_WIDTHS
    ]
    assert variant_paths("legacy/photo.jpg") == ["legacy/photo.jpg"]


async def test_storage_writes_every_width_and_no_leftovers(tmp_path: Path) -> None:
    storage = LocalImageStorage(tmp_path)

    path = await storage.save("products/7", encode_image(encoded((800, 600))))

    assert path.startswith("products/7/") and path.endswith("-1280.webp")
    names = sorted(file.name for file in (tmp_path / "products/7").iterdir())
    assert len(names) == len(IMAGE_WIDTHS)
    assert all(name.endswith(".webp") for name in names)


async def test_storage_files_are_readable_by_nginx(tmp_path: Path) -> None:
    storage = LocalImageStorage(tmp_path)

    path = await storage.save("products/7", encode_image(encoded((100, 100))))

    assert (tmp_path / path).stat().st_mode & 0o004
    assert (tmp_path / "products/7").stat().st_mode & 0o005 == 0o005


async def test_storage_names_never_repeat(tmp_path: Path) -> None:
    storage = LocalImageStorage(tmp_path)
    image = encode_image(encoded((100, 100)))

    assert await storage.save("a", image) != await storage.save("a", image)


async def test_storage_delete_removes_every_width(tmp_path: Path) -> None:
    storage = LocalImageStorage(tmp_path)
    path = await storage.save("a", encode_image(encoded((100, 100))))

    await storage.delete(path)

    assert list((tmp_path / "a").iterdir()) == []


async def test_storage_delete_tolerates_missing_files(tmp_path: Path) -> None:
    await LocalImageStorage(tmp_path).delete("a/never-1280.webp")


async def test_storage_delete_logs_failures_instead_of_raising(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(self: Path, missing_ok: bool = False) -> None:
        raise PermissionError("read only")

    monkeypatch.setattr(Path, "unlink", fail)

    await LocalImageStorage(tmp_path).delete("a/x-1280.webp")


async def test_storage_cleans_up_a_partial_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = LocalImageStorage(tmp_path)
    image = encode_image(encoded((100, 100)))
    real_replace = Path.replace
    calls = []

    def fail_on_third(self: Path, target: Path) -> Path:
        calls.append(target)
        if len(calls) == 3:
            raise OSError("disk full")
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", fail_on_third)

    with pytest.raises(OSError):
        await storage.save("a", image)

    assert list((tmp_path / "a").iterdir()) == []
