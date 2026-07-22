from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SourceLens API"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000"]

    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_database: str = "sourcelens"
    lancedb_path: Path = Path("./data/lancedb")
    upload_path: Path = Path("./data/uploads")

    openai_api_key: str | None = None
    openai_chat_model: str = "gpt-5.6-terra"
    openai_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    max_upload_bytes: int = 20 * 1024 * 1024
    chunk_size_chars: int = 2800
    chunk_overlap_chars: int = 400
    retrieval_candidates: int = 12
    retrieval_limit: int = 5
    minimum_relevance: float = Field(default=0.18, ge=0, le=1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
