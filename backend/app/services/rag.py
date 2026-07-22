import time
from typing import Any

from app.core.settings import Settings
from app.repositories.mongo import MongoRepository
from app.repositories.vectors import VectorRepository
from app.schemas import Citation, Message
from app.services.openai_client import OpenAIService

ABSTENTION = "I couldn't find enough evidence in the selected documents to answer that."


class RagService:
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
        return round(max(0.0, min(1.0, 1.0 - float(match.get("_distance", 1.0)))), 4)

    async def ask(self, conversation_id: str, question: str) -> Message:
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
        [query_vector] = await self.openai.embed([question])
        matches = self.vectors.search(
            query_vector,
            conversation.document_ids,
            self.settings.retrieval_candidates,
        )
        matches = [
            match for match in matches if self._relevance(match) >= self.settings.minimum_relevance
        ][: self.settings.retrieval_limit]

        if not matches:
            answer = ABSTENTION
            cited_matches: list[dict[str, Any]] = []
            sufficient = False
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
            answer = payload.answer if sufficient else ABSTENTION
            cited_matches = (
                [matches[source_id - 1] for source_id in valid_source_ids]
                if sufficient
                else []
            )

        citations = [
            Citation(
                chunk_id=match["chunk_id"],
                document_id=match["document_id"],
                filename=match["filename"],
                page_number=match["page_number"],
                excerpt=match["text"][:700],
                relevance=self._relevance(match),
            )
            for match in cited_matches
        ]
        latency_ms = round((time.perf_counter() - started) * 1000)
        message = await self.mongo.create_message(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": answer,
                "citations": [citation.model_dump() for citation in citations],
                "has_sufficient_evidence": sufficient,
                "model": self.settings.openai_chat_model,
                "latency_ms": latency_ms,
            }
        )
        await self.mongo.update_conversation_title(conversation_id, question)
        return message
