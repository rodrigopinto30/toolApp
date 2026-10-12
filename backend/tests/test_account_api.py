from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import REFRESH_COOKIE
from app.models import Address, Province, User
from tests.conftest import Outbox
from tests.factories import make_province, make_user

PASSWORD = "a-long-password"
ADDRESSES = "/api/v1/me/addresses"
PROFILES = "/api/v1/me/billing-profiles"


@pytest.fixture
async def user(client: AsyncClient, session: AsyncSession) -> User:
    user = await make_user(session, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert response.status_code == 200
    return user


@pytest.fixture
async def province(session: AsyncSession) -> Province:
    return await make_province(session)


def _address(province: Province, **overrides: Any) -> dict[str, Any]:
    data = {
        "label": "Home",
        "recipient_name": "Ana Diaz",
        "phone": "+54 11 5555-5555",
        "street": "Calle Falsa",
        "number": "123",
        "city": "CABA",
        "province_code": province.code,
        "postal_code": "C1000",
    }
    return data | overrides


def _profile(**overrides: Any) -> dict[str, Any]:
    data = {
        "tax_id_type": "CUIT",
        "tax_id": "20-12345678-6",
        "tax_condition": "monotributo",
        "legal_name": "Ana Diaz",
        "fiscal_address": "Calle Falsa 123, CABA",
    }
    return data | overrides


async def test_get_and_update_me(client: AsyncClient, user: User) -> None:
    body = {"first_name": " Ana María ", "phone": "1155555555"}
    response = await client.patch("/api/v1/me", json=body)

    assert response.status_code == 200
    assert response.json()["first_name"] == "Ana María"
    me = (await client.get("/api/v1/me")).json()
    assert (me["phone"], me["email_verified"], me["role"]) == ("1155555555", False, "customer")
    assert (await client.patch("/api/v1/me", json={"phone": None})).json()["phone"] is None


@pytest.mark.parametrize(
    "body", [{"first_name": None}, {"email": "new@example.com"}, {"role": "admin"}]
)
async def test_update_me_rejects_invalid_fields(
    client: AsyncClient, user: User, body: dict[str, Any]
) -> None:
    assert (await client.patch("/api/v1/me", json=body)).status_code == 422


async def test_change_password(client: AsyncClient, user: User, outbox: Outbox) -> None:
    old_refresh = client.cookies.get(REFRESH_COOKIE, path="/api/v1/auth")

    wrong = await client.post(
        "/api/v1/me/password",
        json={"current_password": "not-it-at-all", "new_password": "a-new-long-password"},
    )
    changed = await client.post(
        "/api/v1/me/password",
        json={"current_password": PASSWORD, "new_password": "a-new-long-password"},
    )

    assert wrong.status_code == 422
    assert wrong.json()["code"] == "invalid_current_password"
    assert changed.status_code == 204
    assert client.cookies.get(REFRESH_COOKIE, path="/api/v1/auth") != old_refresh
    assert (await client.get("/api/v1/me")).status_code == 200
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    assert outbox.sent("password_changed")


async def test_address_crud(client: AsyncClient, user: User, province: Province) -> None:
    created = await client.post(ADDRESSES, json=_address(province, floor_apt="3B"))
    assert created.status_code == 201
    address = created.json()
    assert address["is_default"] is True
    assert address["province"] == {"code": province.code, "name": province.name}

    updated = await client.patch(
        f"{ADDRESSES}/{address['id']}", json={"city": "La Plata", "floor_apt": None}
    )
    assert updated.status_code == 200
    assert (updated.json()["city"], updated.json()["floor_apt"]) == ("La Plata", None)

    assert (await client.get(f"{ADDRESSES}/{address['id']}")).json()["city"] == "La Plata"
    assert (await client.delete(f"{ADDRESSES}/{address['id']}")).status_code == 204
    assert (await client.get(ADDRESSES)).json() == []


async def test_only_one_default_address(
    client: AsyncClient, user: User, province: Province
) -> None:
    first = (await client.post(ADDRESSES, json=_address(province, label="Home"))).json()
    second = (await client.post(ADDRESSES, json=_address(province, label="Work"))).json()
    assert (first["is_default"], second["is_default"]) == (True, False)

    shop = _address(province, label="Shop", is_default=True)
    third = (await client.post(ADDRESSES, json=shop)).json()
    await client.patch(f"{ADDRESSES}/{second['id']}", json={"is_default": True})

    defaults = {a["label"]: a["is_default"] for a in (await client.get(ADDRESSES)).json()}
    assert defaults == {"Home": False, "Work": True, "Shop": False}
    assert third["is_default"] is True


async def test_deleting_the_default_promotes_the_newest(
    client: AsyncClient, user: User, province: Province
) -> None:
    first = (await client.post(ADDRESSES, json=_address(province, label="Home"))).json()
    await client.post(ADDRESSES, json=_address(province, label="Work"))
    await client.post(ADDRESSES, json=_address(province, label="Shop"))

    await client.delete(f"{ADDRESSES}/{first['id']}")

    addresses = (await client.get(ADDRESSES)).json()
    assert [(a["label"], a["is_default"]) for a in addresses] == [("Shop", True), ("Work", False)]


async def test_address_validation(client: AsyncClient, user: User, province: Province) -> None:
    unknown = await client.post(ADDRESSES, json=_address(province, province_code="ZZ-99"))
    blank = await client.post(ADDRESSES, json=_address(province, street="   "))
    extra = await client.post(ADDRESSES, json=_address(province, user_id=1))

    assert unknown.status_code == 422 and unknown.json()["code"] == "unknown_province"
    assert blank.status_code == extra.status_code == 422


async def test_address_limit(
    client: AsyncClient, user: User, province: Province, settings: Settings
) -> None:
    for n in range(settings.max_addresses):
        response = await client.post(ADDRESSES, json=_address(province, label=f"A{n}"))
        assert response.status_code == 201

    over = await client.post(ADDRESSES, json=_address(province))

    assert over.status_code == 422
    assert over.json()["code"] == "limit_reached"


async def test_other_users_addresses_are_not_found(
    client: AsyncClient, session: AsyncSession, user: User, province: Province
) -> None:
    other = await make_user(session)
    address_id = (await client.post(ADDRESSES, json=_address(province))).json()["id"]
    await session.execute(update(Address).where(Address.id == address_id).values(user_id=other.id))
    url = f"{ADDRESSES}/{address_id}"

    assert (await client.get(url)).status_code == 404
    assert (await client.patch(url, json={"city": "X"})).status_code == 404
    assert (await client.delete(url)).status_code == 404
    assert (await client.get(ADDRESSES)).json() == []


async def test_billing_profile_crud(client: AsyncClient, user: User) -> None:
    created = await client.post(PROFILES, json=_profile())
    assert created.status_code == 201
    profile = created.json()
    assert (profile["tax_id"], profile["is_default"]) == ("20123456786", True)

    updated = await client.patch(f"{PROFILES}/{profile['id']}", json={"legal_name": "Ana D."})
    assert updated.json()["legal_name"] == "Ana D."

    assert (await client.delete(f"{PROFILES}/{profile['id']}")).status_code == 204
    assert (await client.get(PROFILES)).json() == []


@pytest.mark.parametrize(
    "overrides",
    [
        {"tax_id": "20-12345678-5"},
        {"tax_id_type": "DNI", "tax_id": "12345678"},
        {"tax_id_type": "DNI", "tax_id": "123", "tax_condition": "consumidor_final"},
    ],
)
async def test_billing_profile_validation(
    client: AsyncClient, user: User, overrides: dict[str, Any]
) -> None:
    assert (await client.post(PROFILES, json=_profile(**overrides))).status_code == 422


async def test_billing_profile_update_is_validated_as_a_whole(
    client: AsyncClient, user: User
) -> None:
    profile = (await client.post(PROFILES, json=_profile())).json()

    response = await client.patch(f"{PROFILES}/{profile['id']}", json={"tax_id_type": "DNI"})

    assert response.status_code == 422
    assert response.json()["code"] == "invalid_tax_id"
    assert (await client.get(f"{PROFILES}/{profile['id']}")).json()["tax_id_type"] == "CUIT"


async def test_billing_profile_limit(client: AsyncClient, user: User, settings: Settings) -> None:
    for _ in range(settings.max_billing_profiles):
        await client.post(PROFILES, json=_profile())

    assert (await client.post(PROFILES, json=_profile())).json()["code"] == "limit_reached"


async def test_account_responses_are_not_cached(client: AsyncClient, user: User) -> None:
    assert (await client.get("/api/v1/me")).headers["Cache-Control"] == "no-store"
