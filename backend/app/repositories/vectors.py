from pathlib import Path
from typing import Any

import lancedb
from lancedb.index import FTS
from lancedb.rerankers import RRFReranker
from lancedb.table import Table

TABLE_NAME = "document_chunks"
TEXT_COLUMN = "text"


class VectorRepository:
    """Store and hybrid-search document chunks in an embedded LanceDB table."""

    def __init__(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(path)
        if self._table_exists():
            self._ensure_fts_index(self.db.open_table(TABLE_NAME))

    def _table_exists(self) -> bool:
        """Return whether the document chunk table has been created."""
        return TABLE_NAME in self.db.list_tables().tables

    @staticmethod
    def _ensure_fts_index(table: Table) -> None:
        """Create the full-text index required by hybrid search when missing."""
        has_text_index = any(
            index.index_type == "FTS" and TEXT_COLUMN in index.columns
            for index in table.list_indices()
        )
        if not has_text_index:
            table.create_index(TEXT_COLUMN, config=FTS())

    def ping(self) -> None:
        """Raise when LanceDB cannot list its tables."""
        self.db.list_tables()

    def add_chunks(self, chunks: list[dict[str, Any]]) -> None:
        """Append chunk vectors and ensure their text is available to hybrid search."""
        if not chunks:
            return
        if self._table_exists():
            table = self.db.open_table(TABLE_NAME)
            table.add(chunks)
        else:
            table = self.db.create_table(TABLE_NAME, data=chunks)
        self._ensure_fts_index(table)

    def search(
        self,
        query_vector: list[float],
        query_text: str,
        document_ids: list[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        """Fuse semantic and keyword matches with model-free reciprocal rank fusion."""
        if not self._table_exists() or not document_ids:
            return []
        allowed = ", ".join(f"'{item}'" for item in document_ids)
        return (
            self.db.open_table(TABLE_NAME)
            .search(query_type="hybrid", fts_columns=TEXT_COLUMN)
            .vector(query_vector)
            .text(query_text)
            .metric("cosine")
            .rerank(RRFReranker(return_score="all"))
            .where(f"document_id IN ({allowed})")
            .limit(limit)
            .to_list()
        )

    def delete_document(self, document_id: str) -> None:
        """Delete every indexed chunk that belongs to a document."""
        if self._table_exists():
            self.db.open_table(TABLE_NAME).delete(f"document_id = '{document_id}'")
