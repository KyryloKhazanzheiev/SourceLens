import hashlib
import re
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import fitz
import structlog
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.settings import Settings
from app.repositories.mongo import MongoRepository
from app.repositories.vectors import VectorRepository
from app.schemas import Document, DocumentStatus
from app.services.openai_client import OpenAIService

log = structlog.get_logger()


class DocumentValidationError(ValueError):
    """Raised when an upload cannot be safely accepted or extracted."""


@dataclass(frozen=True)
class PageText:
    """Extracted text associated with its one-based source page."""

    page_number: int
    text: str


@dataclass(frozen=True)
class TextChunk:
    """Retrieval chunk with stable position metadata within a page."""

    page_number: int
    chunk_index: int
    text: str


@dataclass(frozen=True)
class SourceFile:
    """Original document file resolved from trusted metadata."""

    document: Document
    path: Path
    media_type: str


def normalise_text(value: str) -> str:
    """Normalize whitespace while retaining paragraph boundaries."""
    value = value.replace("\x00", " ").replace("\r\n", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_pages(filename: str, data: bytes) -> list[PageText]:
    """Extract non-empty, page-aware text from a supported PDF or TXT file."""
    suffix = Path(filename).suffix.lower()
    if suffix == ".txt":
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise DocumentValidationError("Text files must be UTF-8 encoded.") from exc
        text = normalise_text(text)
        return [PageText(page_number=1, text=text)] if text else []

    if suffix == ".pdf":
        try:
            with fitz.open(stream=data, filetype="pdf") as pdf:
                pages: list[PageText] = []
                for index, page in enumerate(pdf):
                    text = normalise_text(page.get_text("text"))
                    if text:
                        pages.append(PageText(page_number=index + 1, text=text))
                return pages
        except fitz.FileDataError as exc:
            raise DocumentValidationError("The PDF is corrupted or unreadable.") from exc

    raise DocumentValidationError("Only PDF and UTF-8 TXT files are supported.")


def chunk_pages(
    pages: list[PageText], chunk_size: int = 2800, overlap: int = 400
) -> list[TextChunk]:
    """Split pages into overlapping chunks without crossing page boundaries."""
    if chunk_size <= overlap or overlap < 0:
        raise ValueError("chunk_size must be greater than overlap")

    chunks: list[TextChunk] = []
    for page in pages:
        paragraphs = [item.strip() for item in page.text.split("\n\n") if item.strip()]
        page_text = "\n\n".join(paragraphs)
        start = 0
        index = 0
        while start < len(page_text):
            end = min(start + chunk_size, len(page_text))
            if end < len(page_text):
                boundary = page_text.rfind("\n", start + chunk_size // 2, end)
                if boundary > start:
                    end = boundary
            text = page_text[start:end].strip()
            if text:
                chunks.append(
                    TextChunk(page_number=page.page_number, chunk_index=index, text=text)
                )
                index += 1
            if end >= len(page_text):
                break
            start = max(end - overlap, start + 1)
    return chunks


class DocumentService:
    """Coordinate validation, storage, embedding, and indexing of documents."""

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
        self.settings.upload_path.mkdir(parents=True, exist_ok=True)

    async def seed_samples(self) -> None:
        """Idempotently ingest bundled TXT samples that are not already ready."""
        sample_path = self.settings.sample_documents_path
        if not sample_path.exists():
            log.warning("sample_documents_path_missing", path=str(sample_path))
            return

        for path in sorted(sample_path.glob("*.txt")):
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            duplicate = await self.mongo.get_document_by_sha(digest)
            if duplicate and duplicate.status == DocumentStatus.ready:
                continue
            if duplicate:
                await self.delete(duplicate.id)

            upload = UploadFile(
                file=BytesIO(data),
                filename=path.name,
                headers=Headers({"content-type": "text/plain"}),
            )
            try:
                document = await self.ingest(upload)
                log.info(
                    "sample_document_seeded",
                    document_id=document.id,
                    filename=document.filename,
                )
            except Exception as exc:
                log.warning(
                    "sample_document_seed_failed",
                    filename=path.name,
                    error=str(exc),
                )
            finally:
                await upload.close()

    async def ingest(self, upload: UploadFile) -> Document:
        """Validate and index an upload, recording a failed state on processing errors."""
        filename = Path(upload.filename or "").name
        suffix = Path(filename).suffix.lower()
        if suffix not in {".pdf", ".txt"}:
            raise DocumentValidationError("Only PDF and UTF-8 TXT files are supported.")
        content_type = upload.content_type or "application/octet-stream"
        allowed_content_types = {
            ".pdf": {"application/pdf", "application/octet-stream"},
            ".txt": {"text/plain", "application/octet-stream"},
        }
        if content_type not in allowed_content_types[suffix]:
            raise DocumentValidationError("The file content type does not match its extension.")

        data = await upload.read(self.settings.max_upload_bytes + 1)
        if not data:
            raise DocumentValidationError("The uploaded file is empty.")
        if len(data) > self.settings.max_upload_bytes:
            raise DocumentValidationError("The uploaded file exceeds the 20 MB limit.")
        if suffix == ".pdf" and not data.startswith(b"%PDF"):
            raise DocumentValidationError("The uploaded file is not a valid PDF.")

        digest = hashlib.sha256(data).hexdigest()
        duplicate = await self.mongo.get_document_by_sha(digest)
        if duplicate:
            raise DocumentValidationError(f"{duplicate.filename} has already been uploaded.")

        document = await self.mongo.create_document(
            {
                "filename": filename,
                "content_type": content_type,
                "size_bytes": len(data),
                "sha256": digest,
                "status": DocumentStatus.processing,
                "page_count": 0,
                "chunk_count": 0,
                "error_message": None,
            }
        )
        storage_path = self.settings.upload_path / f"{document.id}{suffix}"

        try:
            storage_path.write_bytes(data)
            pages = extract_pages(filename, data)
            if not pages:
                raise DocumentValidationError(
                    "No extractable text was found. "
                    "Scanned PDFs need OCR, which is not in this MVP."
                )
            chunks = chunk_pages(
                pages,
                chunk_size=self.settings.chunk_size_chars,
                overlap=self.settings.chunk_overlap_chars,
            )
            embeddings = await self.openai.embed([chunk.text for chunk in chunks])
            records = [
                {
                    "vector": vector,
                    "chunk_id": str(uuid4()),
                    "document_id": document.id,
                    "filename": filename,
                    "page_number": chunk.page_number,
                    "chunk_index": chunk.chunk_index,
                    "text": chunk.text,
                    "content_hash": hashlib.sha256(chunk.text.encode()).hexdigest(),
                }
                for chunk, vector in zip(chunks, embeddings, strict=True)
            ]
            self.vectors.add_chunks(records)
            updated = await self.mongo.update_document(
                document.id,
                {
                    "status": DocumentStatus.ready,
                    "page_count": max(page.page_number for page in pages),
                    "chunk_count": len(records),
                },
            )
            if updated is None:
                raise RuntimeError("Document disappeared during ingestion.")
            return updated
        except Exception as exc:
            await self.mongo.update_document(
                document.id,
                {"status": DocumentStatus.failed, "error_message": str(exc)[:500]},
            )
            raise

    async def get_source_file(self, document_id: str) -> SourceFile | None:
        """Resolve an original PDF or TXT file without accepting a filesystem path."""
        document = await self.mongo.get_document(document_id)
        if not document:
            return None

        suffix = Path(document.filename).suffix.lower()
        media_types = {".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8"}
        if suffix not in media_types:
            return None

        upload_root = self.settings.upload_path.resolve()
        source_path = (upload_root / f"{document.id}{suffix}").resolve()
        if not source_path.is_relative_to(upload_root) or not source_path.is_file():
            return None
        return SourceFile(
            document=document,
            path=source_path,
            media_type=media_types[suffix],
        )

    async def delete(self, document_id: str) -> bool:
        """Remove a document and its vectors and uploaded file when it exists."""
        document = await self.mongo.get_document(document_id)
        if not document:
            return False
        self.vectors.delete_document(document_id)
        for suffix in (".pdf", ".txt"):
            (self.settings.upload_path / f"{document_id}{suffix}").unlink(missing_ok=True)
        return await self.mongo.delete_document(document_id)
