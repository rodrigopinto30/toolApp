from decimal import Decimal

import pytest

from app.schemas.reviews import public_name
from app.services.reviews import rating_summary


@pytest.mark.parametrize(
    ("ratings", "average", "count"),
    [
        ([], "0.00", 0),
        ([4], "4.00", 1),
        ([5, 4], "4.50", 2),
        ([5, 5, 4], "4.67", 3),
        ([5, 4, 4], "4.33", 3),
        ([1, 1, 1, 1, 1, 1, 1, 2], "1.13", 8),
    ],
)
def test_rating_summary(ratings: list[int], average: str, count: int) -> None:
    assert rating_summary(ratings) == (Decimal(average), count)


@pytest.mark.parametrize(
    ("first_name", "last_name", "expected"),
    [
        ("Ana", "Diaz", "Ana D."),
        ("Ana", "díaz", "Ana D."),
        ("José", "Ñandú", "José Ñ."),
        ("Ana", "", "Ana"),
    ],
)
def test_public_name(first_name: str, last_name: str, expected: str) -> None:
    assert public_name(first_name, last_name) == expected
