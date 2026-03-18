from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database — swap to a PostgreSQL URL in Phase 2, no code changes needed
    database_url: str = "sqlite:///./ripple_grader.db"

    # Anthropic
    anthropic_api_key: str = ""
    anthropic_haiku: str = "claude-haiku-4-5-20251001"
    anthropic_sonnet: str = "claude-sonnet-4-6"
    anthropic_opus: str = "claude-opus-4-6"

    # CORS origins — stored as a plain str so pydantic-settings never tries to
    # JSON-decode it.  The cors_origins property splits on commas at read time.
    # In .env: CORS_ORIGINS=http://localhost:5173,https://app.example.com
    cors_origins_raw: str = Field(
        default="http://localhost:5173",
        validation_alias="cors_origins",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]

    # Environment — controls which middleware and routes are active.
    # "development" : local dev; registers DevSessionInterceptorMiddleware and
    #                 the /auth/local-login routes.
    # "production"  : university cloud; those code paths are never reached.
    env: str = "development"

    # Dev-only session settings (ignored when ENV=production)
    session_cookie_name: str = "dev_session_id"
    session_ttl_hours: int = 8

    # Student email domain — student ID + "@" + this value = email address
    # e.g. student.uq.edu.au  →  s1234567@student.uq.edu.au
    student_email_domain: str = ""


settings = Settings()
