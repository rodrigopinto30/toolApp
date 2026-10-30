from collections.abc import Callable, Mapping, Sequence
from urllib.parse import urlencode

from app.core.config import Settings
from app.email.sender import EmailMessage
from app.email.templates import ORDER_LABELS, format_money, render
from app.models import Locale, OrderStatus, User
from app.schemas.common import Money
from app.schemas.orders import OrderRead

DELIVERY_STEPS = frozenset({OrderStatus.SHIPPED, OrderStatus.READY_FOR_PICKUP})


class Mailer:
    def __init__(self, settings: Settings, schedule: Callable[[EmailMessage], None]) -> None:
        self.settings = settings
        self.schedule = schedule

    def _link(self, locale: Locale, path: str, token: str | None = None) -> str:
        fragment = f"#{urlencode({'token': token})}" if token else ""
        return f"{self.settings.public_url}/{locale}{path}{fragment}"

    def _send(
        self,
        name: str,
        user: User,
        locale: Locale,
        link: str | None = None,
        *,
        values: Mapping[str, str] | None = None,
        details: Sequence[str] = (),
    ) -> None:
        self.schedule(
            render(
                name,
                locale,
                to=user.email,
                first_name=user.first_name,
                link=link,
                values=values,
                details=details,
            )
        )

    def verify_email(self, user: User, token: str, locale: Locale) -> None:
        self._send("verify_email", user, locale, self._link(locale, "/verify-email", token))

    def account_exists(self, user: User, locale: Locale) -> None:
        self._send("account_exists", user, locale, self._link(locale, "/forgot-password"))

    def reset_password(self, user: User, token: str, locale: Locale) -> None:
        self._send("reset_password", user, locale, self._link(locale, "/reset-password", token))

    def password_changed(self, user: User, locale: Locale) -> None:
        self._send("password_changed", user, locale)

    def order_confirmed(self, user: User, order: OrderRead, locale: Locale) -> None:
        link = self._link(locale, f"/account/orders/{order.number}")
        values = {"number": order.number}
        details = order_summary(order, locale)
        self._send("order_confirmed", user, locale, link, values=values, details=details)

    def payment_rejected(self, user: User, order: OrderRead, locale: Locale) -> None:
        link = self._link(locale, "/cart")
        self._send("payment_rejected", user, locale, link, values={"number": order.number})

    def order_cancelled(self, user: User, order: OrderRead, refunded: bool, locale: Locale) -> None:
        link = self._link(locale, f"/account/orders/{order.number}")
        details = [refund_line(order, locale)] if refunded else []
        values = {"number": order.number}
        self._send("order_cancelled", user, locale, link, values=values, details=details)

    def order_status_changed(self, user: User, order: OrderRead, locale: Locale) -> None:
        link = self._link(locale, f"/account/orders/{order.number}")
        values = {"number": order.number}
        details = status_details(order, locale)
        self._send(f"order_{order.status}", user, locale, link, values=values, details=details)


def order_summary(order: OrderRead, locale: Locale) -> list[str]:
    labels = ORDER_LABELS[locale]

    def money(value: Money) -> str:
        return format_money(value.amount, value.currency, locale)

    lines = [
        f"{item.quantity} × {item.product_name}"
        + (f" ({item.variant_label})" if item.variant_label else "")
        + f": {money(item.line_total)}"
        for item in order.items
    ]
    lines.append(f"{labels['subtotal']}: {money(order.subtotal)}")
    if order.discount_total.amount:
        lines.append(f"{labels['discount']}: -{money(order.discount_total)}")
    lines.append(f"{labels['shipping']}: {money(order.shipping_total)}")
    lines.append(f"{labels['total']}: {money(order.total)}")
    if line := delivery_line(order, locale):
        lines.append(line)
    return lines


def delivery_line(order: OrderRead, locale: Locale) -> str | None:
    labels = ORDER_LABELS[locale]
    delivery = order.delivery
    if delivery.address and delivery.zone:
        address = delivery.address
        street = f"{address.street} {address.number}, {address.city}, {address.province.name}"
        days = f"{delivery.zone.eta_min_days}-{delivery.zone.eta_max_days}"
        return labels["ship_to"].format(address=street, days=days)
    if delivery.pickup_point:
        point = delivery.pickup_point
        return labels["pickup_at"].format(name=point.name, address=point.address)
    return None


def refund_line(order: OrderRead, locale: Locale) -> str:
    total = format_money(order.total.amount, order.total.currency, locale)
    return ORDER_LABELS[locale]["refunded"].format(amount=total)


def status_details(order: OrderRead, locale: Locale) -> list[str]:
    if order.status == OrderStatus.REFUNDED:
        return [refund_line(order, locale)]
    line = delivery_line(order, locale) if order.status in DELIVERY_STEPS else None
    return [line] if line else []
