from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    """Settings read from environment variables (injected by docker compose)."""

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

    health_check_timeout: float = 2.0

    log_level: str = "INFO"
    request_timeout_seconds: float = 25.0
    max_body_bytes: int = 1_048_576

    admin_email: str | None = None
    admin_password: SecretStr | None = None

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
