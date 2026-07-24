import time
from typing import Any

from app.core.settings import Settings
from app.repositories.mongo import MongoRepository
from app.repositories.vectors import VectorRepository
from app.schemas import AbstentionReason, Citation, Message
from app.services.openai_client import OpenAIService

NO_RELEVANT_PASSAGES = (
    "I couldn't find a relevant passage in the selected documents for that question."
)
INSUFFICIENT_SUPPORT = (
    "I found related passages, but they do not provide enough evidence for a reliable answer."
)


class RagService:
    """Coordinate scoped retrieval, grounded generation, and message persistence."""

    def __init__(
        self,
        settings: Settings,
        mongo: MongoRepository,
        vectors: VectorRepository,
        openai: OpenAIService,
    ) -> None:
        self.settings = settings
        self.mongo = mongo
        self.vectors = vectors
        self.openai = openai

    @staticmethod
    def _relevance(match: dict[str, Any]) -> float:
        """Convert cosine distance to a bounded, user-facing relevance score."""
        return round(max(0.0, min(1.0, 1.0 - float(match.get("_distance", 1.0)))), 4)

    async def ask(self, conversation_id: str, question: str) -> Message:
        """Answer and persist a question using only the conversation's documents."""
        conversation = await self.mongo.get_conversation(conversation_id)
        if conversation is None:
            raise LookupError("Conversation not found.")

        started = time.perf_counter()
        await self.mongo.create_message(
            {
                "conversation_id": conversation_id,
                "role": "user",
                "content": question,
                "citations": [],
            }
        )
        await self.mongo.update_conversation_title(conversation_id, question)
        [query_vector] = await self.openai.embed([question])
        matches = self.vectors.search(
            query_vector,
            question,
            conversation.document_ids,
            self.settings.retrieval_candidates,
        )
        matches = [
            match for match in matches if self._relevance(match) >= self.settings.minimum_relevance
        ][: self.settings.retrieval_limit]
        best_relevance = self._relevance(matches[0]) if matches else None

        if not matches:
            answer = NO_RELEVANT_PASSAGES
            cited_sources: list[tuple[int, dict[str, Any]]] = []
            sufficient = False
            abstention_reason = AbstentionReason.no_relevant_passages
        else:
            payload = await self.openai.answer(question, matches)
            valid_source_ids = list(
                dict.fromkeys(
                    source_id
                    for source_id in payload.cited_source_ids
                    if 1 <= source_id <= len(matches)
                )
            )
            sufficient = payload.has_sufficient_evidence and bool(valid_source_ids)
            answer = payload.answer if sufficient else INSUFFICIENT_SUPPORT
            abstention_reason = (
                None if sufficient else AbstentionReason.insufficient_support
            )
            cited_sources = (
                [(source_id, matches[source_id - 1]) for source_id in valid_source_ids]
                if sufficient
                else []
            )

        citations = [
            Citation(
                source_number=source_id,
                chunk_id=match["chunk_id"],
                document_id=match["document_id"],
                filename=match["filename"],
                page_number=match["page_number"],
                excerpt=match["text"][:700],
                relevance=self._relevance(match),
            )
            for source_id, match in cited_sources
        ]
        latency_ms = round((time.perf_counter() - started) * 1000)
        message = await self.mongo.create_message(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": answer,
                "citations": [citation.model_dump() for citation in citations],
                "has_sufficient_evidence": sufficient,
                "abstention_reason": abstention_reason,
                "retrieval_count": len(matches),
                "retrieval_best_relevance": best_relevance,
                "model": self.settings.openai_chat_model,
                "latency_ms": latency_ms,
            }
        )
        return message
