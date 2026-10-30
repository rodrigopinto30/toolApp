from datetime import datetime

from pydantic import Field

from app.models import UserRole
from app.schemas.admin.common import AdminPageParams
from app.schemas.common import PatchModel, ReadModel


class UserListParams(AdminPageParams):
    q: str | None = Field(None, min_length=2, max_length=100)
    role: UserRole | None = None
    is_active: bool | None = None


class UserUpdate(PatchModel):
    is_active: bool | None = None
    role: UserRole | None = None


class AdminUserRead(ReadModel):
    id: int
    email: str
    first_name: str
    last_name: str
    phone: str | None
    role: UserRole
    is_active: bool
    email_verified_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
