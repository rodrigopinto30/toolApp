from types import TracebackType
from typing import Any, Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.base import Base
from app.db.repositories.base import SqlAlchemyRepository


class SqlAlchemyUnitOfWork:
    """One transaction per `async with`: commits if the block succeeds, rolls back if it
    raises. Repositories share the session, so everything is atomic.

        async with uow:
            uow.repository(Product).add(product)
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory
        self._session: AsyncSession | None = None
        self._repositories: dict[type[Any], SqlAlchemyRepository[Any]] = {}

    @property
    def session(self) -> AsyncSession:
        if self._session is None:
            raise RuntimeError("The unit of work is not active: use `async with uow:`.")
        return self._session

    async def __aenter__(self) -> Self:
        if self._session is not None:
            raise RuntimeError("The unit of work is already active.")
        self._session = self._session_factory()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        try:
            if exc_type is None:
                await self.session.commit()
            else:
                await self.session.rollback()
        finally:
            await self.session.close()
            self._session = None
            self._repositories.clear()

    def repository[ModelT: Base](self, model: type[ModelT]) -> SqlAlchemyRepository[ModelT]:
        if model not in self._repositories:
            self._repositories[model] = SqlAlchemyRepository(self.session, model)
        return self._repositories[model]

    async def commit(self) -> None:
        """Explicit commit inside the block (e.g. before calling an external service)."""
        await self.session.commit()

    async def rollback(self) -> None:
        await self.session.rollback()

    async def flush(self) -> None:
        await self.session.flush()
