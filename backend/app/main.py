from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import conversations, documents, health
from app.container import AppContainer
from app.core.logging import configure_logging
from app.core.settings import get_settings

configure_logging()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    container = AppContainer(get_settings())
    app.state.container = container
    await container.start()
    log.info("application_started", environment=container.settings.environment)
    try:
        yield
    finally:
        await container.close()
        log.info("application_stopped")


app = FastAPI(
    title="SourceLens API",
    version="0.1.0",
    description="Grounded answers from uploaded PDF and text documents.",
    lifespan=lifespan,
)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    started = __import__("time").perf_counter()
    response = await call_next(request)
    log.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        latency_ms=round((__import__("time").perf_counter() - started) * 1000),
    )
    return response


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(documents.router, prefix=settings.api_prefix)
app.include_router(conversations.router, prefix=settings.api_prefix)
