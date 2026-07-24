from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_container
from app.container import AppContainer
from app.schemas import (
    Conversation,
    ConversationCreate,
    ConversationDetail,
    ErrorResponse,
    Message,
    MessageCreate,
)
from app.services.openai_client import MissingOpenAIKeyError

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[Conversation])
async def list_conversations(
    container: Annotated[AppContainer, Depends(get_container)],
) -> list[Conversation]:
    """Return saved conversations ordered by most recent activity."""
    return await container.mongo.list_conversations()


@router.post("", response_model=Conversation, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    container: Annotated[AppContainer, Depends(get_container)],
) -> Conversation:
    """Create a conversation scoped to documents that are ready for retrieval."""
    documents = [await container.mongo.get_document(item) for item in payload.document_ids]
    if any(document is None or document.status != "ready" for document in documents):
        raise HTTPException(status_code=400, detail="Select documents that are ready.")
    return await container.mongo.create_conversation(payload.document_ids)


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetail,
    responses={404: {"model": ErrorResponse}},
)
async def get_conversation(
    conversation_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> ConversationDetail:
    """Return a conversation together with its messages."""
    conversation = await container.mongo.get_conversation_detail(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_conversation(
    conversation_id: str,
    container: Annotated[AppContainer, Depends(get_container)],
) -> None:
    """Delete a conversation and all messages that belong to it."""
    if not await container.mongo.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")


@router.post(
    "/{conversation_id}/messages",
    response_model=Message,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
async def create_message(
    conversation_id: str,
    payload: MessageCreate,
    container: Annotated[AppContainer, Depends(get_container)],
) -> Message:
    """Answer a question against the conversation's fixed document scope."""
    try:
        return await container.rag.ask(conversation_id, payload.content)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MissingOpenAIKeyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
