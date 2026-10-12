import pytest
from pydantic import ValidationError

from app.models import TaxCondition, TaxIdType
from app.schemas.account import BillingProfileCreate
from app.schemas.auth import RegisterRequest
from app.schemas.validators import check_tax_identity, is_valid_cuit, normalize_email


@pytest.mark.parametrize("cuit", ["33693450239", "20123456786", "27333333339"])
def test_valid_cuits(cuit: str) -> None:
    assert is_valid_cuit(cuit)


@pytest.mark.parametrize(
    "cuit",
    ["20123456785", "11123456786", "2012345678", "201234567860", "2012345678a"],
)
def test_invalid_cuits(cuit: str) -> None:
    assert not is_valid_cuit(cuit)


def test_dni_rules() -> None:
    check_tax_identity(TaxIdType.DNI, "12345678", TaxCondition.FINAL_CONSUMER)
    with pytest.raises(ValueError):
        check_tax_identity(TaxIdType.DNI, "123456", TaxCondition.FINAL_CONSUMER)
    with pytest.raises(ValueError):
        check_tax_identity(TaxIdType.DNI, "12345678", TaxCondition.MONOTRIBUTO)


def test_tax_id_accepts_dashes() -> None:
    profile = BillingProfileCreate(
        tax_id_type=TaxIdType.CUIT,
        tax_id="20-12345678-6",
        tax_condition=TaxCondition.MONOTRIBUTO,
        legal_name="Ana Diaz",
        fiscal_address="Calle Falsa 123",
    )

    assert profile.tax_id == "20123456786"


def test_email_is_normalized() -> None:
    assert normalize_email("  Ana.Diaz@Example.COM ") == "ana.diaz@example.com"
    for invalid in ("ana", "ana@", "ana @example.com", "a@b"):
        with pytest.raises(ValueError):
            normalize_email(invalid)


def _register(**overrides: object) -> RegisterRequest:
    data: dict[str, object] = {
        "email": "ana@example.com",
        "password": "a-long-password",
        "first_name": "Ana",
        "last_name": "Diaz",
    }
    data.update(overrides)
    return RegisterRequest.model_validate(data)


def test_password_rules() -> None:
    assert _register().password == "a-long-password"
    for password in ("short", "x" * 129, "ANA@example.com"):
        with pytest.raises(ValidationError):
            _register(password=password)
