from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from app.api.dependencies import get_container
from app.container import AppContainer
from app.schemas import Document, ErrorResponse
from app.services.documents import DocumentValidationError
from app.services.openai_client import MissingOpenAIKeyError

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[Document])
async def list_documents(
    container: Annotated[AppContainer, Depends(get_container)],
) -> list[Document]:
    """Return uploaded documents ordered by creation time."""
    return await container.mongo.list_documents()


@router.get("/{document_id}", response_model=Document, responses={404: {"model": ErrorResponse}})
async def get_document(
    document_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> Document:
    """Return one document or respond with 404 when it does not exist."""
    document = await container.mongo.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@router.get(
    "/{document_id}/content",
    response_class=FileResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_document_content(
    document_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> FileResponse:
    """Stream the original document inline for citation verification."""
    source = await container.documents.get_source_file(document_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Original document file not found.")
    return FileResponse(
        path=source.path,
        media_type=source.media_type,
        filename=source.document.filename,
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post(
    "",
    response_model=Document,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def upload_document(
    container: Annotated[AppContainer, Depends(get_container)],
    file: Annotated[UploadFile, File(description="PDF or UTF-8 TXT, maximum 20 MB")],
) -> Document:
    """Validate, persist, chunk, embed, and index an uploaded document."""
    try:
        return await container.documents.ingest(file)
    except DocumentValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except MissingOpenAIKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> Response:
    """Remove a document from metadata, file, and vector storage."""
    if not await container.documents.delete(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
