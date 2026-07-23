from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient

from app.schemas import Conversation, ConversationDetail, Document, Message


def _now() -> datetime:
    return datetime.now(UTC)


def _public(record: Mapping[str, Any]) -> dict[str, Any]:
    data = dict(record)
    data["id"] = str(data.pop("_id"))
    return data


class MongoRepository:
    def __init__(self, url: str, database: str) -> None:
        self.client: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(url)
        self.db = self.client[database]

    async def ping(self) -> None:
        await self.client.admin.command("ping")

    async def ensure_indexes(self) -> None:
        await self.db.documents.create_index("sha256", unique=True)
        await self.db.messages.create_index(
            [("conversation_id", ASCENDING), ("created_at", ASCENDING)]
        )
        await self.db.conversations.create_index([("updated_at", DESCENDING)])

    async def close(self) -> None:
        await self.client.close()

    async def create_document(self, values: dict[str, Any]) -> Document:
        document_id = str(uuid4())
        now = _now()
        record = {"_id": document_id, **values, "created_at": now, "updated_at": now}
        await self.db.documents.insert_one(record)
        return Document.model_validate(_public(record))

    async def update_document(self, document_id: str, values: dict[str, Any]) -> Document | None:
        values = {**values, "updated_at": _now()}
        record = await self.db.documents.find_one_and_update(
            {"_id": document_id}, {"$set": values}, return_document=True
        )
        return Document.model_validate(_public(record)) if record else None

    async def get_document(self, document_id: str) -> Document | None:
        record = await self.db.documents.find_one({"_id": document_id})
        return Document.model_validate(_public(record)) if record else None

    async def get_document_by_sha(self, sha256: str) -> Document | None:
        record = await self.db.documents.find_one({"sha256": sha256})
        return Document.model_validate(_public(record)) if record else None

    async def list_documents(self) -> list[Document]:
        cursor = self.db.documents.find().sort("created_at", -1)
        return [Document.model_validate(_public(record)) async for record in cursor]

    async def delete_document(self, document_id: str) -> bool:
        result = await self.db.documents.delete_one({"_id": document_id})
        return result.deleted_count == 1

    async def create_conversation(self, document_ids: list[str]) -> Conversation:
        conversation_id = str(uuid4())
        now = _now()
        record = {
            "_id": conversation_id,
            "title": "New document conversation",
            "document_ids": document_ids,
            "created_at": now,
            "updated_at": now,
        }
        await self.db.conversations.insert_one(record)
        return Conversation.model_validate(_public(record))

    async def get_conversation(self, conversation_id: str) -> Conversation | None:
        record = await self.db.conversations.find_one({"_id": conversation_id})
        return Conversation.model_validate(_public(record)) if record else None

    async def list_conversations(self) -> list[Conversation]:
        cursor = self.db.conversations.find().sort("updated_at", DESCENDING)
        return [Conversation.model_validate(_public(record)) async for record in cursor]

    async def get_conversation_detail(self, conversation_id: str) -> ConversationDetail | None:
        conversation = await self.get_conversation(conversation_id)
        if not conversation:
            return None
        cursor = self.db.messages.find({"conversation_id": conversation_id}).sort("created_at", 1)
        messages = [Message.model_validate(_public(record)) async for record in cursor]
        return ConversationDetail(**conversation.model_dump(), messages=messages)

    async def delete_conversation(self, conversation_id: str) -> bool:
        result = await self.db.conversations.delete_one({"_id": conversation_id})
        if result.deleted_count != 1:
            return False
        await self.db.messages.delete_many({"conversation_id": conversation_id})
        return True

    async def create_message(self, values: dict[str, Any]) -> Message:
        message_id = str(uuid4())
        record = {"_id": message_id, **values, "created_at": _now()}
        await self.db.messages.insert_one(record)
        return Message.model_validate(_public(record))

    async def update_conversation_title(self, conversation_id: str, title: str) -> None:
        await self.db.conversations.update_one(
            {"_id": conversation_id},
            {"$set": {"title": title[:72], "updated_at": _now()}},
        )
