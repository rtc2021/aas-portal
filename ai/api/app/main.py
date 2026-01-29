"""
AAS AI Backend - Main Application
FastAPI server with Ollama + Qdrant integration
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core import setup_logging, get_logger, get_settings
from .routers import chat, diagnose, search, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown."""
    logger = get_logger("main")
    settings = get_settings()
    
    logger.info(
        "Starting AAS AI Backend",
        environment=settings.environment,
        ollama_host=settings.ollama_host,
        qdrant_host=settings.qdrant_host,
    )
    
    # TODO: Initialize connections
    # - Ollama client
    # - Qdrant client
    # - PostgreSQL pool
    # - Redis client
    
    yield
    
    logger.info("Shutting down AAS AI Backend")


# Initialize logging
setup_logging()

# Create FastAPI app
app = FastAPI(
    title="AAS AI Backend",
    description="AI-powered copilot for automatic door technicians",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aas-service-portal.netlify.app",
        "https://aas-portal.com",
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(chat.router, prefix="/v1", tags=["Chat"])
app.include_router(diagnose.router, prefix="/v1", tags=["Diagnose"])
app.include_router(search.router, prefix="/v1", tags=["Search"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "AAS AI Backend",
        "version": "1.0.0",
        "docs": "/docs",
    }
