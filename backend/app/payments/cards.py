import re
from dataclasses import dataclass
from datetime import datetime

NON_DIGITS = re.compile(r"[ -]")
EXPIRY = re.compile(r"^(0[1-9]|1[0-2])/(\d{2})$")


@dataclass(frozen=True, repr=False)
class Card:
    number: str
    expiry_month: int
    expiry_year: int
    cvc: str
    holder: str

    @property
    def last4(self) -> str:
        return self.number[-4:]

    @property
    def brand(self) -> str:
        return card_brand(self.number)


def normalize_number(value: str) -> str:
    return NON_DIGITS.sub("", value)


def luhn_valid(number: str) -> bool:
    total = 0
    for position, char in enumerate(reversed(number)):
        digit = int(char)
        if position % 2 == 1:
            digit = digit * 2 - 9 if digit > 4 else digit * 2
        total += digit
    return total % 10 == 0


def valid_number(number: str) -> bool:
    return number.isdigit() and 13 <= len(number) <= 19 and luhn_valid(number)


def card_brand(number: str) -> str:
    if number.startswith("4"):
        return "visa"
    if number[:2] in {"34", "37"}:
        return "amex"
    if 51 <= int(number[:2]) <= 55 or 2221 <= int(number[:4]) <= 2720:
        return "mastercard"
    return "card"


def parse_expiry(value: str) -> tuple[int, int] | None:
    match = EXPIRY.match(value)
    if match is None:
        return None
    return int(match[1]), 2000 + int(match[2])


def is_expired(month: int, year: int, now: datetime) -> bool:
    return (year, month) < (now.year, now.month)
