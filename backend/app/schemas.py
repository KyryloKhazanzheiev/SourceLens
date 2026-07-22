from datetime import UTC, datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(UTC)


class DocumentStatus(StrEnum):
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    failed = "failed"


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    status: DocumentStatus
    page_count: int = 0
    chunk_count: int = 0
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ConversationCreate(BaseModel):
    document_ids: list[str] = Field(min_length=1)

    @field_validator("document_ids")
    @classmethod
    def unique_document_ids(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class Conversation(BaseModel):
    id: str
    title: str
    document_ids: list[str]
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Citation(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    page_number: int
    excerpt: str
    relevance: float = Field(ge=0, le=1)


class MessageCreate(BaseModel):
    content: str = Field(min_length=2, max_length=4000)


class Message(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    citations: list[Citation] = []
    has_sufficient_evidence: bool | None = None
    model: str | None = None
    latency_ms: int | None = None
    created_at: datetime = Field(default_factory=utc_now)


class ConversationDetail(Conversation):
    messages: list[Message] = []


class AnswerPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str
    cited_source_ids: list[int]
    has_sufficient_evidence: bool


class HealthResponse(BaseModel):
    status: str
    checks: dict[str, str] = {}


class ErrorResponse(BaseModel):
    detail: str
