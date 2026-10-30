import re

IMAGE_WIDTHS = (320, 640, 960, 1280)

_VARIANT = re.compile(r"(?P<stem>.+)-\d+\.webp")


def media_url(path: str | None) -> str | None:
    return f"/media/{path}" if path else None


def variant_paths(path: str) -> list[str]:
    match = _VARIANT.fullmatch(path)
    if match is None:
        return [path]
    return [f"{match['stem']}-{width}.webp" for width in IMAGE_WIDTHS]
