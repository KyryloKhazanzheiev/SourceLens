from app.services.rag import RagService


def test_relevance_converts_cosine_distance() -> None:
    assert RagService._relevance({"_distance": 0.23}) == 0.77
    assert RagService._relevance({"_distance": 2}) == 0
    assert RagService._relevance({"_distance": -1}) == 1
