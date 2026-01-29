"""
Qdrant Vector Store Service
Handles vector storage and retrieval
"""

from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue, MatchAny

from ..core import get_settings, get_logger
from .ollama_client import embed_text

logger = get_logger("qdrant")

# Singleton client
_client = None


def get_client() -> QdrantClient:
    """Get or create Qdrant client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = QdrantClient(
            host=settings.qdrant_host,
            port=settings.qdrant_port,
        )
    return _client


async def ensure_collection(
    collection_name: str,
    vector_size: int = 768,  # nomic-embed-text dimension
) -> None:
    """Create collection if it doesn't exist."""
    client = get_client()
    
    collections = client.get_collections().collections
    exists = any(c.name == collection_name for c in collections)
    
    if not exists:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created collection", collection=collection_name)


async def upsert_vectors(
    collection: str,
    points: list[dict],
) -> None:
    """
    Upsert vectors into collection.
    Points should have: id, vector, payload
    """
    client = get_client()
    
    point_structs = [
        PointStruct(
            id=p["id"],
            vector=p["vector"],
            payload=p.get("payload", {}),
        )
        for p in points
    ]
    
    client.upsert(
        collection_name=collection,
        points=point_structs,
    )
    
    logger.info("Upserted vectors", collection=collection, count=len(points))


async def search_collection(
    collection: str,
    query: str,
    filter_conditions: Optional[dict] = None,
    top_k: int = 10,
) -> list[dict]:
    """
    Search collection with query text.
    Automatically embeds query and applies filters.
    """
    client = get_client()
    
    # Embed query
    query_vector = await embed_text(query)
    if not query_vector:
        logger.warning("Empty query vector")
        return []
    
    # Build filter
    qdrant_filter = None
    if filter_conditions and filter_conditions.get("must"):
        must_conditions = []
        for cond in filter_conditions["must"]:
            key = cond.get("key")
            match = cond.get("match", {})
            
            if "value" in match:
                must_conditions.append(
                    FieldCondition(key=key, match=MatchValue(value=match["value"]))
                )
            elif "any" in match:
                must_conditions.append(
                    FieldCondition(key=key, match=MatchAny(any=match["any"]))
                )
        
        if must_conditions:
            qdrant_filter = Filter(must=must_conditions)
    
    # Execute search
    results = client.search(
        collection_name=collection,
        query_vector=query_vector,
        query_filter=qdrant_filter,
        limit=top_k,
    )
    
    return [
        {
            "id": str(r.id),
            "score": r.score,
            "payload": r.payload,
        }
        for r in results
    ]


async def search_by_vector(
    collection: str,
    vector: list[float],
    filter_conditions: Optional[dict] = None,
    top_k: int = 10,
) -> list[dict]:
    """Search collection with pre-computed vector."""
    client = get_client()
    
    # Build filter (same as above)
    qdrant_filter = None
    if filter_conditions and filter_conditions.get("must"):
        must_conditions = []
        for cond in filter_conditions["must"]:
            key = cond.get("key")
            match = cond.get("match", {})
            
            if "value" in match:
                must_conditions.append(
                    FieldCondition(key=key, match=MatchValue(value=match["value"]))
                )
            elif "any" in match:
                must_conditions.append(
                    FieldCondition(key=key, match=MatchAny(any=match["any"]))
                )
        
        if must_conditions:
            qdrant_filter = Filter(must=must_conditions)
    
    results = client.search(
        collection_name=collection,
        query_vector=vector,
        query_filter=qdrant_filter,
        limit=top_k,
    )
    
    return [
        {
            "id": str(r.id),
            "score": r.score,
            "payload": r.payload,
        }
        for r in results
    ]
