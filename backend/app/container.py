from app.core.settings import Settings
from app.repositories.mongo import MongoRepository
from app.repositories.vectors import VectorRepository
from app.services.documents import DocumentService
from app.services.openai_client import OpenAIService
from app.services.rag import RagService


class AppContainer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mongo = MongoRepository(settings.mongodb_url, settings.mongodb_database)
        self.vectors = VectorRepository(settings.lancedb_path)
        self.openai = OpenAIService(settings)
        self.documents = DocumentService(settings, self.mongo, self.vectors, self.openai)
        self.rag = RagService(settings, self.mongo, self.vectors, self.openai)

    async def start(self) -> None:
        await self.mongo.ensure_indexes()

    async def close(self) -> None:
        await self.mongo.close()
