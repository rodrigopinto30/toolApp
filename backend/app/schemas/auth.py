from typing import Self

from pydantic import BaseModel, Field, model_validator

from app.models import Locale
from app.schemas.common import RequestModel
from app.schemas.validators import AnyPassword, Email, Name, Password, Phone

Token = Field(min_length=20, max_length=128)


class RegisterRequest(RequestModel):
    email: Email
    password: Password
    first_name: Name
    last_name: Name
    phone: Phone | None = None
    locale: Locale = Locale.ES

    @model_validator(mode="after")
    def check_password(self) -> Self:
        if self.password.strip().lower() == self.email:
            raise ValueError("The password cannot be the email")
        return self


class LoginRequest(RequestModel):
    email: Email
    password: AnyPassword


class VerifyEmailRequest(RequestModel):
    token: str = Token


class ForgotPasswordRequest(RequestModel):
    email: Email
    locale: Locale = Locale.ES


class ResetPasswordRequest(RequestModel):
    token: str = Token
    password: Password
    locale: Locale = Locale.ES


class AcceptedRead(BaseModel):
    message: str
