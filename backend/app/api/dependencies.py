from fastapi import Request

from app.container import AppContainer


def get_container(request: Request) -> AppContainer:
    """Return the application-scoped dependency container for a request."""
    return request.app.state.container
