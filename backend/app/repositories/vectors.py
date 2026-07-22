from pathlib import Path
from typing import Any

import lancedb

TABLE_NAME = "document_chunks"


class VectorRepository:
    def __init__(self, path: Path) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self.db = lancedb.connect(path)

    def ping(self) -> None:
        self.db.table_names()

    def add_chunks(self, chunks: list[dict[str, Any]]) -> None:
        if not chunks:
            return
        if TABLE_NAME in self.db.table_names():
            self.db.open_table(TABLE_NAME).add(chunks)
        else:
            self.db.create_table(TABLE_NAME, data=chunks)

    def search(
        self, query_vector: list[float], document_ids: list[str], limit: int
    ) -> list[dict[str, Any]]:
        if TABLE_NAME not in self.db.table_names() or not document_ids:
            return []
        allowed = ", ".join(f"'{item}'" for item in document_ids)
        return (
            self.db.open_table(TABLE_NAME)
            .search(query_vector)
            .metric("cosine")
            .where(f"document_id IN ({allowed})")
            .limit(limit)
            .to_list()
        )

    def delete_document(self, document_id: str) -> None:
        if TABLE_NAME in self.db.table_names():
            self.db.open_table(TABLE_NAME).delete(f"document_id = '{document_id}'")
