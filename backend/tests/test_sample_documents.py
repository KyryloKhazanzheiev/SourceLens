from pathlib import Path

import pytest

from app.services.documents import chunk_pages, extract_pages

SAMPLES_PATH = Path(__file__).parents[2] / "docs" / "samples"


@pytest.mark.parametrize(
    "filename",
    [
        "atlas-project-brief.txt",
        "atlas-support-and-security-policy.txt",
    ],
)
def test_sample_document_is_extractable_and_chunkable(filename: str) -> None:
    path = SAMPLES_PATH / filename
    pages = extract_pages(path.name, path.read_bytes())
    chunks = chunk_pages(pages)

    assert pages
    assert chunks
    assert all(chunk.text for chunk in chunks)
