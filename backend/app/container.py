from app.core.settings import Settings
from app.repositories.mongo import MongoRepository
from app.repositories.vectors import VectorRepository
from app.services.documents import DocumentService
from app.services.openai_client import OpenAIService
from app.services.rag import RagService


class AppContainer:
    """Own application-scoped repositories and services."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mongo = MongoRepository(settings.mongodb_url, settings.mongodb_database)
        self.vectors = VectorRepository(settings.lancedb_path)
        self.openai = OpenAIService(settings)
        self.documents = DocumentService(settings, self.mongo, self.vectors, self.openai)
        self.rag = RagService(settings, self.mongo, self.vectors, self.openai)

    async def start(self) -> None:
        """Prepare persistent indexes and seed bundled sample documents."""
        await self.mongo.ensure_indexes()
        await self.documents.seed_samples()

    async def close(self) -> None:
        """Release application-scoped resources."""
        await self.mongo.close()
