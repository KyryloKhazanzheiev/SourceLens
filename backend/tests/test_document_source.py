from types import SimpleNamespace

import pytest

from app.schemas import Document, DocumentStatus
from app.services.documents import DocumentService


class FakeMongo:
    def __init__(self, document: Document | None) -> None:
        self.document = document

    async def get_document(self, document_id: str) -> Document | None:
        if self.document and self.document.id == document_id:
            return self.document
        return None


def make_document(document_id: str = "document-1") -> Document:
    return Document(
        id=document_id,
        filename="report.pdf",
        content_type="application/pdf",
        size_bytes=12,
        sha256="hash",
        status=DocumentStatus.ready,
    )


@pytest.mark.asyncio
async def test_get_source_file_resolves_file_from_document_metadata(tmp_path) -> None:
    document = make_document()
    source_path = tmp_path / f"{document.id}.pdf"
    source_path.write_bytes(b"%PDF-source")
    service = DocumentService(
        SimpleNamespace(upload_path=tmp_path),
        FakeMongo(document),
        SimpleNamespace(),
        SimpleNamespace(),
    )

    source = await service.get_source_file(document.id)

    assert source is not None
    assert source.path == source_path
    assert source.media_type == "application/pdf"


@pytest.mark.asyncio
async def test_get_source_file_rejects_identifier_that_escapes_upload_root(tmp_path) -> None:
    document = make_document("../outside")
    service = DocumentService(
        SimpleNamespace(upload_path=tmp_path),
        FakeMongo(document),
        SimpleNamespace(),
        SimpleNamespace(),
    )

    assert await service.get_source_file(document.id) is None
