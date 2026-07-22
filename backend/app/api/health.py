from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.dependencies import get_container
from app.container import AppContainer
from app.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
async def liveness() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=HealthResponse)
async def readiness(
    container: Annotated[AppContainer, Depends(get_container)],
) -> HealthResponse:
    checks: dict[str, str] = {}
    try:
        await container.mongo.ping()
        checks["mongodb"] = "ok"
    except Exception:
        checks["mongodb"] = "unavailable"
    try:
        container.vectors.ping()
        checks["lancedb"] = "ok"
    except Exception:
        checks["lancedb"] = "unavailable"
    checks["openai"] = "configured" if container.settings.openai_api_key else "missing_key"
    status = "ok" if all(value in {"ok", "configured"} for value in checks.values()) else "degraded"
    return HealthResponse(status=status, checks=checks)
