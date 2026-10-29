import time
from collections.abc import Callable
from enum import StrEnum


class BreakerState(StrEnum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        *,
        failure_threshold: int,
        reset_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.reset_seconds = reset_seconds
        self.clock = clock
        self._failures = 0
        self._opened_at: float | None = None
        self._trial_running = False

    @property
    def state(self) -> BreakerState:
        if self._opened_at is None:
            return BreakerState.CLOSED
        if self.clock() - self._opened_at < self.reset_seconds:
            return BreakerState.OPEN
        return BreakerState.HALF_OPEN

    def available(self) -> bool:
        return self.state != BreakerState.OPEN

    def acquire(self) -> bool:
        state = self.state
        if state == BreakerState.CLOSED:
            return True
        if state == BreakerState.OPEN or self._trial_running:
            return False
        self._trial_running = True
        return True

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None
        self._trial_running = False

    def record_failure(self) -> None:
        self._failures += 1
        if self._trial_running or self._failures >= self.failure_threshold:
            self._opened_at = self.clock()
            self._trial_running = False
