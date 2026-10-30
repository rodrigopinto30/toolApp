from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c1f4e2a9d3"
down_revision: str | Sequence[str] | None = "6041b0ca861d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("product_images", sa.Column("width", sa.Integer(), nullable=True))
    op.add_column("product_images", sa.Column("height", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("product_images", "height")
    op.drop_column("product_images", "width")
