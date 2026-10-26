from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    APP_NAME: str = "CareerPilot API"
    APP_ENV: Literal["development", "test", "staging", "production"] = "development"
    APP_SECRET_KEY: str = "development-only-secret-change-me-now"
    API_PREFIX: str = "/api/v1"
    DATABASE_URL: str = "postgresql+asyncpg://career:career@localhost:5432/career"
    DATABASE_URL_SYNC: str = "postgresql+psycopg://career:career@localhost:5432/career"
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    WEB_ORIGIN: str = "http://localhost:3000"
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 30
    OBJECT_STORAGE_ENDPOINT: str = "http://localhost:9000"
    OBJECT_STORAGE_PUBLIC_ENDPOINT: str = "http://localhost:9000"
    OBJECT_STORAGE_ACCESS_KEY: str = "career-local"
    OBJECT_STORAGE_SECRET_KEY: str = "career-local-secret"
    OBJECT_STORAGE_BUCKET_QUARANTINE: str = "career-quarantine"
    OBJECT_STORAGE_BUCKET_DOCUMENTS: str = "career-documents"
    CLAMAV_HOST: str = "localhost"
    CLAMAV_PORT: int = 3310
    MAX_CV_BYTES: int = 10 * 1024 * 1024
    COOKIE_SECURE: bool = False
    JOB_PROVIDER_TIMEOUT_SECONDS: float = 8.0
    GREENHOUSE_BOARD_TOKENS: str = ""
    LEVER_SITE_NAMES: str = ""

    @field_validator("APP_SECRET_KEY")
    @classmethod
    def secret_is_safe(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("APP_SECRET_KEY must contain at least 32 characters")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
