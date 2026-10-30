from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4e8a1d7f2b6"
down_revision: str | Sequence[str] | None = "b7c1f4e2a9d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column(
            "locale",
            sa.Enum("es", "en", name="locale", native_enum=False, length=5),
            server_default="es",
            nullable=False,
        ),
    )
    op.create_check_constraint(op.f("ck_orders_locale"), "orders", "`locale` IN ('es', 'en')")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_orders_locale"), "orders", type_="check")
    op.drop_column("orders", "locale")
