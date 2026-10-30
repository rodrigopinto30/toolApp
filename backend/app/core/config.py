from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", frozen=True)

    app_env: Literal["development", "production"] = "production"
    api_prefix: str = "/api"

    mysql_host: str = "mysql"
    mysql_port: int = 3306
    mysql_database: str
    mysql_user: str
    mysql_password: SecretStr
    db_pool_size: int = 10
    db_max_overflow: int = 5
    db_pool_timeout: int = 5
    db_connect_timeout: int = 5

    redis_host: str = "redis"
    redis_port: int = 6379
    redis_password: SecretStr
    redis_socket_timeout: float = 2.0
    redis_db: int = 0

    health_check_timeout: float = 2.0

    log_level: str = "INFO"
    request_timeout_seconds: float = 25.0
    max_body_bytes: int = 1_048_576
    max_image_bytes: int = 5_242_880
    media_root: str = "/app/media"

    ars_rounding_step: int = 1
    low_stock_threshold: int = 5
    cache_ttl_catalog: int = 300
    cache_ttl_pricing: int = 600
    cache_ttl_shipping: int = 3600

    payment_timeout_seconds: float = 5.0
    payment_breaker_failures: int = 3
    payment_breaker_reset_seconds: float = 30.0

    frontend_internal_url: str = "http://frontend:3000"
    revalidate_secret: SecretStr | None = None
    revalidate_timeout_seconds: float = 2.0

    jwt_secret: SecretStr | None = None
    jwt_issuer: str = "toolapp"
    jwt_audience: str = "toolapp-api"
    access_token_ttl: int = 900
    refresh_token_ttl: int = 7 * 24 * 3600
    refresh_session_max_age: int = 30 * 24 * 3600
    refresh_reuse_grace: int = 10
    verify_email_token_ttl: int = 24 * 3600
    reset_password_token_ttl: int = 30 * 60
    login_max_failures: int = 5
    login_lockout_seconds: int = 15 * 60
    max_addresses: int = 10
    max_billing_profiles: int = 5

    public_url: str = "https://localhost:8443"
    smtp_host: str | None = None
    smtp_port: int = 25
    smtp_from: str = "ToolApp <no-reply@toolapp.local>"

    admin_email: str | None = None
    admin_password: SecretStr | None = None

    @field_validator("jwt_secret")
    @classmethod
    def check_jwt_secret(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and len(value.get_secret_value().encode()) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return value

    @field_validator("public_url")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def jwt_key(self) -> str:
        if self.jwt_secret is None:
            raise RuntimeError("JWT_SECRET is not set")
        return self.jwt_secret.get_secret_value()

    @property
    def is_dev(self) -> bool:
        return self.app_env == "development"

    @property
    def database_url(self) -> URL:
        return URL.create(
            drivername="mysql+asyncmy",
            username=self.mysql_user,
            password=self.mysql_password.get_secret_value(),
            host=self.mysql_host,
            port=self.mysql_port,
            database=self.mysql_database,
            query={"charset": "utf8mb4"},
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
