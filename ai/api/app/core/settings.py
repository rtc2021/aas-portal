"""
AAS API Configuration
Loaded from environment variables
"""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""
    
    # Environment
    environment: str = "development"
    log_level: str = "info"
    debug: bool = False
    
    # Auth0
    auth0_domain: str = ""
    auth0_audience: str = "https://aas-portal.com/api"
    auth0_algorithms: list[str] = ["RS256"]
    
    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3:8b"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_keep_alive: str = "5m"
    
    # Qdrant
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection_playbooks: str = "playbooks"
    qdrant_collection_manuals: str = "manuals"
    qdrant_collection_parts: str = "parts"
    
    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "aas"
    postgres_user: str = "aas"
    postgres_password: str = ""
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # Rate Limiting
    rate_limit_chat: str = "20/minute"
    rate_limit_search: str = "60/minute"
    
    @property
    def postgres_dsn(self) -> str:
        return f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
    
    @property
    def auth0_jwks_url(self) -> str:
        return f"https://{self.auth0_domain}/.well-known/jwks.json"
    
    @property
    def auth0_issuer(self) -> str:
        return f"https://{self.auth0_domain}/"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
