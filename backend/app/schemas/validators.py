import re
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field, StringConstraints

from app.models import TaxCondition, TaxIdType

_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
CUIT_PREFIXES = frozenset({"20", "23", "24", "27", "30", "33", "34"})
_CUIT_WEIGHTS = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if len(email) > 254 or not _EMAIL.fullmatch(email):
        raise ValueError("Invalid email address")
    return email


def digits_only(value: object) -> object:
    return re.sub(r"[\s.-]", "", value) if isinstance(value, str) else value


def cuit_check_digit(first_ten: str) -> str:
    pairs = zip(first_ten, _CUIT_WEIGHTS, strict=True)
    remainder = sum(int(digit) * weight for digit, weight in pairs) % 11
    return "012345678990"[11 - remainder]


def is_valid_cuit(value: str) -> bool:
    return (
        len(value) == 11
        and value.isdigit()
        and value[:2] in CUIT_PREFIXES
        and cuit_check_digit(value[:10]) == value[10]
    )


def check_tax_identity(tax_id_type: TaxIdType, tax_id: str, tax_condition: TaxCondition) -> None:
    if tax_id_type == TaxIdType.DNI:
        if not (tax_id.isdigit() and 7 <= len(tax_id) <= 8):
            raise ValueError("A DNI has 7 or 8 digits")
        if tax_condition != TaxCondition.FINAL_CONSUMER:
            raise ValueError("A DNI is only valid for consumidor_final")
    elif not is_valid_cuit(tax_id):
        raise ValueError("Invalid CUIT")


Email = Annotated[str, AfterValidator(normalize_email)]
Password = Annotated[str, Field(min_length=10, max_length=128)]
AnyPassword = Annotated[str, Field(min_length=1, max_length=128)]


def text(max_length: int) -> StringConstraints:
    return StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)


Name = Annotated[str, text(80)]
Phone = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 ()-]{6,30}$", max_length=30)
]
PostalCode = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9]{4,10}$")
]
TaxId = Annotated[str, BeforeValidator(digits_only), StringConstraints(pattern=r"^[0-9]{7,11}$")]
