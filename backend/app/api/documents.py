from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

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
    return await container.mongo.list_documents()


@router.get("/{document_id}", response_model=Document, responses={404: {"model": ErrorResponse}})
async def get_document(
    document_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> Document:
    document = await container.mongo.get_document(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


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
    if not await container.documents.delete(document_id):
        raise HTTPException(status_code=404, detail="Document not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
