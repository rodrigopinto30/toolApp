from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from html import escape

from app.email.sender import EmailMessage
from app.models import Currency, Locale


@dataclass(frozen=True)
class Template:
    subject: str
    lines: tuple[str, ...]
    link_label: str | None = None
    footer: str | None = None


TEMPLATES: dict[str, dict[Locale, Template]] = {
    "verify_email": {
        Locale.ES: Template(
            subject="Confirmá tu email",
            lines=(
                "Hola {first_name},",
                "Gracias por registrarte en ToolApp. Confirmá tu email con este link "
                "(vence en 24 horas):",
            ),
            link_label="Confirmar email",
            footer="Si no creaste esta cuenta, ignorá este mensaje.",
        ),
        Locale.EN: Template(
            subject="Confirm your email",
            lines=(
                "Hi {first_name},",
                "Thanks for signing up for ToolApp. Confirm your email with this link "
                "(it expires in 24 hours):",
            ),
            link_label="Confirm email",
            footer="If you did not create this account, ignore this message.",
        ),
    },
    "account_exists": {
        Locale.ES: Template(
            subject="Ya tenés una cuenta en ToolApp",
            lines=(
                "Hola {first_name},",
                "Alguien intentó registrarse en ToolApp con este email, pero ya tenés una "
                "cuenta. Podés iniciar sesión o recuperar tu contraseña:",
            ),
            link_label="Recuperar contraseña",
            footer="Si no fuiste vos, ignorá este mensaje.",
        ),
        Locale.EN: Template(
            subject="You already have a ToolApp account",
            lines=(
                "Hi {first_name},",
                "Someone tried to sign up for ToolApp with this email, but you already have "
                "an account. You can log in or reset your password:",
            ),
            link_label="Reset password",
            footer="If it was not you, ignore this message.",
        ),
    },
    "reset_password": {
        Locale.ES: Template(
            subject="Recuperá tu contraseña",
            lines=(
                "Hola {first_name},",
                "Recibimos un pedido para cambiar tu contraseña. Usá este link "
                "(vence en 30 minutos):",
            ),
            link_label="Cambiar contraseña",
            footer="Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.",
        ),
        Locale.EN: Template(
            subject="Reset your password",
            lines=(
                "Hi {first_name},",
                "We received a request to change your password. Use this link "
                "(it expires in 30 minutes):",
            ),
            link_label="Change password",
            footer="If you did not request it, ignore this message: your password stays the same.",
        ),
    },
    "order_confirmed": {
        Locale.ES: Template(
            subject="Confirmamos tu pedido {number}",
            lines=(
                "Hola {first_name},",
                "Recibimos el pago de tu pedido {number}. Este es el detalle:",
            ),
            link_label="Ver pedido",
            footer="Te avisamos por email cada vez que cambie su estado.",
        ),
        Locale.EN: Template(
            subject="Your order {number} is confirmed",
            lines=(
                "Hi {first_name},",
                "We received the payment for your order {number}. Here are the details:",
            ),
            link_label="View order",
            footer="We will email you every time its status changes.",
        ),
    },
    "payment_rejected": {
        Locale.ES: Template(
            subject="No pudimos cobrar tu pedido {number}",
            lines=(
                "Hola {first_name},",
                "El pago de tu pedido {number} fue rechazado y el pedido se canceló. "
                "Los productos volvieron a tu carrito, así que podés intentar con otra tarjeta.",
            ),
            link_label="Ir al carrito",
        ),
        Locale.EN: Template(
            subject="We could not charge your order {number}",
            lines=(
                "Hi {first_name},",
                "The payment for your order {number} was rejected and the order was cancelled. "
                "The products are back in your cart, so you can try another card.",
            ),
            link_label="Go to the cart",
        ),
    },
    "order_cancelled": {
        Locale.ES: Template(
            subject="Cancelamos tu pedido {number}",
            lines=("Hola {first_name},", "Tu pedido {number} fue cancelado."),
            link_label="Ver pedido",
        ),
        Locale.EN: Template(
            subject="Your order {number} was cancelled",
            lines=("Hi {first_name},", "Your order {number} was cancelled."),
            link_label="View order",
        ),
    },
    "password_changed": {
        Locale.ES: Template(
            subject="Tu contraseña cambió",
            lines=(
                "Hola {first_name},",
                "La contraseña de tu cuenta de ToolApp se cambió y se cerraron las demás "
                "sesiones.",
            ),
            footer="Si no fuiste vos, recuperá tu contraseña de inmediato.",
        ),
        Locale.EN: Template(
            subject="Your password was changed",
            lines=(
                "Hi {first_name},",
                "The password of your ToolApp account was changed and your other sessions "
                "were closed.",
            ),
            footer="If it was not you, reset your password right away.",
        ),
    },
}


ORDER_LABELS: dict[Locale, dict[str, str]] = {
    Locale.ES: {
        "subtotal": "Subtotal",
        "discount": "Descuento",
        "shipping": "Envío",
        "total": "Total",
        "ship_to": "Envío a {address} ({days} días hábiles)",
        "pickup_at": "Retiro en {name}, {address}",
        "refunded": "Te reintegramos {amount} en el mismo medio de pago.",
    },
    Locale.EN: {
        "subtotal": "Subtotal",
        "discount": "Discount",
        "shipping": "Shipping",
        "total": "Total",
        "ship_to": "Shipping to {address} ({days} business days)",
        "pickup_at": "Pickup at {name}, {address}",
        "refunded": "We refunded {amount} to the same payment method.",
    },
}


def format_money(amount: Decimal, currency: Currency, locale: Locale) -> str:
    decimals = 0 if currency == Currency.ARS and amount == amount.to_integral_value() else 2
    formatted = f"{amount:,.{decimals}f}"
    if locale == Locale.ES:
        formatted = formatted.translate(str.maketrans(",.", ".,"))
    return f"{currency} {formatted}"


def render(
    name: str,
    locale: Locale,
    *,
    to: str,
    first_name: str,
    link: str | None = None,
    values: Mapping[str, str] | None = None,
    details: Sequence[str] = (),
) -> EmailMessage:
    template = TEMPLATES[name][locale]
    fields = {"first_name": first_name, **(values or {})}
    lines = [line.format(**fields) for line in template.lines]

    text_parts = [*lines]
    html_parts = [f"<p>{escape(line)}</p>" for line in lines]
    if details:
        text_parts.append("\n".join(details))
        items = "".join(f"<li>{escape(line)}</li>" for line in details)
        html_parts.append(f"<ul>{items}</ul>")
    if link and template.link_label:
        text_parts.append(link)
        html_parts.append(f'<p><a href="{escape(link)}">{escape(template.link_label)}</a></p>')
    if template.footer:
        text_parts.append(template.footer)
        html_parts.append(f"<p>{escape(template.footer)}</p>")

    return EmailMessage(
        template=name,
        to=to,
        subject=template.subject.format(**fields),
        text="\n\n".join(text_parts) + "\n",
        html="<!doctype html><html><body>" + "".join(html_parts) + "</body></html>",
    )
