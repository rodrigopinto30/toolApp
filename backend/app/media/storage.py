import asyncio
import uuid
from pathlib import Path
from typing import Protocol

import structlog

from app.core.config import Settings
from app.media.images import ProcessedImage
from app.media.paths import variant_paths

logger = structlog.get_logger(__name__)


class ImageStorage(Protocol):
    async def save(self, folder: str, image: ProcessedImage) -> str: ...

    async def delete(self, path: str) -> None: ...


class LocalImageStorage:
    def __init__(self, root: Path) -> None:
        self.root = root

    async def save(self, folder: str, image: ProcessedImage) -> str:
        return await asyncio.to_thread(self._write, folder, image)

    async def delete(self, path: str) -> None:
        await asyncio.to_thread(self._unlink, path)

    def _write(self, folder: str, image: ProcessedImage) -> str:
        directory = self.root / folder
        directory.mkdir(parents=True, exist_ok=True)
        stem = uuid.uuid4().hex
        written: list[Path] = []
        try:
            for width, content in image.files.items():
                target = directory / f"{stem}-{width}.webp"
                temporary = target.with_suffix(".tmp")
                written.append(temporary)
                temporary.write_bytes(content)
                temporary.replace(target)
                written[-1] = target
        except OSError:
            for file in written:
                file.unlink(missing_ok=True)
            raise
        return f"{folder}/{stem}-{max(image.files)}.webp"

    def _unlink(self, path: str) -> None:
        for variant in variant_paths(path):
            try:
                (self.root / variant).unlink(missing_ok=True)
            except OSError as exc:
                logger.warning("image_delete_failed", path=variant, error=type(exc).__name__)


def create_image_storage(settings: Settings) -> LocalImageStorage:
    return LocalImageStorage(Path(settings.media_root))
