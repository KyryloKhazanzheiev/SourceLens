from app.services.documents import PageText, chunk_pages, normalise_text


def test_normalise_text_preserves_paragraphs() -> None:
    assert normalise_text("Heading\n\n\n  First   paragraph\n\nSecond") == (
        "Heading\n\n First paragraph\n\nSecond"
    )


def test_chunk_pages_preserves_page_metadata_and_overlap() -> None:
    page = PageText(page_number=7, text="A" * 200)
    chunks = chunk_pages([page], chunk_size=100, overlap=20)

    assert len(chunks) >= 2
    assert {chunk.page_number for chunk in chunks} == {7}
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))
    assert chunks[0].text[-20:] in chunks[1].text


def test_chunk_pages_rejects_invalid_window() -> None:
    try:
        chunk_pages([PageText(page_number=1, text="hello")], chunk_size=10, overlap=10)
    except ValueError as exc:
        assert "greater than overlap" in str(exc)
    else:
        raise AssertionError("Expected ValueError")
