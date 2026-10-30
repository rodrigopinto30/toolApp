import pytest

from app.core.exceptions import BusinessRuleViolation
from app.services.admin.catalog import check_category_parent

TREE: dict[int, int | None] = {1: None, 2: 1, 3: 2, 4: None, 5: 4}


def error_code(category_id: int | None, parent_id: int | None) -> str:
    with pytest.raises(BusinessRuleViolation) as caught:
        check_category_parent(TREE, category_id, parent_id)
    return caught.value.code


@pytest.mark.parametrize(
    ("category_id", "parent_id"),
    [(None, None), (None, 1), (None, 2), (2, 4), (3, 5), (3, None), (2, None), (1, None)],
)
def test_valid_positions(category_id: int | None, parent_id: int | None) -> None:
    check_category_parent(TREE, category_id, parent_id)


def test_a_new_category_cannot_go_below_the_third_level() -> None:
    assert error_code(None, 3) == "category_too_deep"


def test_a_subtree_counts_its_whole_height() -> None:
    assert error_code(1, 4) == "category_too_deep"
    assert error_code(2, 5) == "category_too_deep"


def test_a_category_cannot_be_its_own_parent() -> None:
    assert error_code(1, 1) == "category_cycle"


def test_a_category_cannot_move_under_its_descendants() -> None:
    assert error_code(1, 3) == "category_cycle"
    assert error_code(2, 3) == "category_cycle"


def test_the_parent_must_exist() -> None:
    assert error_code(None, 99) == "unknown_parent"
