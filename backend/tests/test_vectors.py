from app.repositories.vectors import TEXT_COLUMN, VectorRepository


def test_hybrid_search_reranks_and_respects_document_scope(tmp_path) -> None:
    repository = VectorRepository(tmp_path / "vectors")
    repository.add_chunks(
        [
            {
                "vector": [0.99, 0.01],
                "chunk_id": "in-scope-hybrid",
                "document_id": "document-1",
                "filename": "one.txt",
                "page_number": 1,
                "chunk_index": 0,
                "text": "The production launch date is in May.",
                "content_hash": "hash-1",
            },
            {
                "vector": [1.0, 0.0],
                "chunk_id": "in-scope-vector",
                "document_id": "document-1",
                "filename": "one.txt",
                "page_number": 2,
                "chunk_index": 1,
                "text": "A semantically related passage without the exact terms.",
                "content_hash": "hash-2",
            },
            {
                "vector": [1.0, 0.0],
                "chunk_id": "out-of-scope",
                "document_id": "document-2",
                "filename": "two.txt",
                "page_number": 1,
                "chunk_index": 0,
                "text": "The production launch date is confidential.",
                "content_hash": "hash-3",
            },
        ]
    )

    matches = repository.search(
        query_vector=[1.0, 0.0],
        query_text="production launch date",
        document_ids=["document-1"],
        limit=3,
    )

    assert matches[0]["chunk_id"] == "in-scope-hybrid"
    assert {match["document_id"] for match in matches} == {"document-1"}
    assert all("_relevance_score" in match and "_distance" in match for match in matches)

    table = repository.db.open_table("document_chunks")
    assert any(
        index.index_type == "FTS" and TEXT_COLUMN in index.columns
        for index in table.list_indices()
    )
