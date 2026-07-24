from app.main import app


def test_conversation_collection_supports_listing_and_creation() -> None:
    operations = app.openapi()["paths"]["/api/v1/conversations"]

    assert "get" in operations
    assert "post" in operations


def test_conversation_resource_supports_reading_and_deletion() -> None:
    operations = app.openapi()["paths"]["/api/v1/conversations/{conversation_id}"]

    assert "get" in operations
    assert "delete" in operations


def test_document_content_supports_original_source_verification() -> None:
    operations = app.openapi()["paths"]["/api/v1/documents/{document_id}/content"]

    assert "get" in operations
