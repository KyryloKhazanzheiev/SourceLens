from types import SimpleNamespace

import pytest

from app.schemas import AbstentionReason, AnswerPayload, Message
from app.services.rag import (
    INSUFFICIENT_SUPPORT,
    NO_RELEVANT_PASSAGES,
    RagService,
)


class FakeMongo:
    def __init__(self) -> None:
        self.created: list[dict] = []

    async def get_conversation(self, conversation_id: str):
        return SimpleNamespace(id=conversation_id, document_ids=["document-1"])

    async def create_message(self, values: dict) -> Message:
        self.created.append(values)
        return Message(id=f"message-{len(self.created)}", **values)

    async def update_conversation_title(self, conversation_id: str, title: str) -> None:
        return None


class FakeVectors:
    def __init__(self, matches: list[dict]) -> None:
        self.matches = matches
        self.query_text: str | None = None

    def search(
        self,
        query_vector: list[float],
        query_text: str,
        document_ids: list[str],
        limit: int,
    ):
        self.query_text = query_text
        return self.matches


class FakeOpenAI:
    def __init__(self, payload: AnswerPayload | None = None) -> None:
        self.payload = payload

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.1, 0.2]]

    async def answer(self, question: str, sources: list[dict]) -> AnswerPayload:
        assert self.payload is not None
        return self.payload


def settings():
    return SimpleNamespace(
        retrieval_candidates=12,
        retrieval_limit=5,
        minimum_relevance=0.15,
        openai_chat_model="test-model",
    )


def test_relevance_converts_cosine_distance() -> None:
    assert RagService._relevance({"_distance": 0.23}) == 0.77
    assert RagService._relevance({"_distance": 2}) == 0
    assert RagService._relevance({"_distance": -1}) == 1


@pytest.mark.asyncio
async def test_no_relevant_passages_has_specific_reason() -> None:
    mongo = FakeMongo()
    vectors = FakeVectors([])
    service = RagService(settings(), mongo, vectors, FakeOpenAI())

    message = await service.ask("conversation-1", "What is missing?")

    assert vectors.query_text == "What is missing?"
    assert message.content == NO_RELEVANT_PASSAGES
    assert message.abstention_reason == AbstentionReason.no_relevant_passages
    assert message.retrieval_count == 0


@pytest.mark.asyncio
async def test_related_but_unsupported_passages_have_specific_reason() -> None:
    mongo = FakeMongo()
    match = {
        "_distance": 0.2,
        "chunk_id": "chunk-1",
        "document_id": "document-1",
        "filename": "document.txt",
        "page_number": 1,
        "text": "Related text without the requested fact.",
    }
    payload = AnswerPayload(
        answer="Unsupported draft",
        cited_source_ids=[],
        has_sufficient_evidence=False,
    )
    service = RagService(settings(), mongo, FakeVectors([match]), FakeOpenAI(payload))

    message = await service.ask("conversation-1", "What is the unsupported fact?")

    assert message.content == INSUFFICIENT_SUPPORT
    assert message.abstention_reason == AbstentionReason.insufficient_support
    assert message.retrieval_count == 1
    assert message.retrieval_best_relevance == 0.8


@pytest.mark.asyncio
async def test_supported_answer_preserves_model_source_number() -> None:
    mongo = FakeMongo()
    match = {
        "_distance": 0.1,
        "chunk_id": "chunk-1",
        "document_id": "document-1",
        "filename": "document.pdf",
        "page_number": 4,
        "text": "The launch date is 24 July.",
    }
    payload = AnswerPayload(
        answer="The launch date is 24 July [1].",
        cited_source_ids=[1],
        has_sufficient_evidence=True,
    )
    service = RagService(settings(), mongo, FakeVectors([match]), FakeOpenAI(payload))

    message = await service.ask("conversation-1", "When is the launch?")

    assert message.citations[0].source_number == 1
    assert message.citations[0].page_number == 4
