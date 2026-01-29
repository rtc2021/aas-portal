"""
Health Check Endpoints
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check."""
    return {"status": "healthy"}


@router.get("/v1/health")
async def health_detailed():
    """Detailed health check with service status."""
    # TODO: Check Ollama, Qdrant, Postgres, Redis connectivity
    return {
        "status": "healthy",
        "services": {
            "ollama": "ok",
            "qdrant": "ok",
            "postgres": "ok",
            "redis": "ok",
        },
    }
