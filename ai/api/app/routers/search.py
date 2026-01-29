"""
Search Endpoint - Vector Search for Parts & Manuals
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core import User, get_current_user, get_logger
from ..services.qdrant_store import search_collection

router = APIRouter()
logger = get_logger("search")


class SearchRequest(BaseModel):
    """Search request body."""
    query: str = Field(..., min_length=1, max_length=500)
    collection: str = Field(default="parts", pattern="^(parts|manuals|playbooks)$")
    filters: Optional[dict] = None
    top_k: int = Field(default=10, ge=1, le=50)


class SearchResult(BaseModel):
    """Single search result."""
    id: str
    score: float
    payload: dict


class SearchResponse(BaseModel):
    """Search response."""
    results: list[SearchResult]
    total: int
    query: str


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    user: Optional[User] = Depends(get_current_user),
):
    """
    Vector search across parts, manuals, or playbooks.
    Supports filtering by manufacturer, model, category.
    """
    logger.info(
        "Search request",
        user_sub=user.sub if user else "anonymous",
        collection=request.collection,
        query_length=len(request.query),
    )
    
    # Check access for certain collections
    if request.collection in ["manuals", "playbooks"]:
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not user.has_any_role(["Admin", "Tech"]):
            raise HTTPException(status_code=403, detail="Technician access required")
    
    try:
        # Build filter payload
        filter_conditions = build_filter(request.filters, user)
        
        # Execute vector search
        results = await search_collection(
            collection=request.collection,
            query=request.query,
            filter_conditions=filter_conditions,
            top_k=request.top_k,
        )
        
        return SearchResponse(
            results=[
                SearchResult(
                    id=str(r.get("id", "")),
                    score=r.get("score", 0.0),
                    payload=r.get("payload", {}),
                )
                for r in results
            ],
            total=len(results),
            query=request.query,
        )
        
    except Exception as e:
        logger.error("Search error", error=str(e), collection=request.collection)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


def build_filter(
    filters: Optional[dict],
    user: Optional[User],
) -> dict:
    """
    Build Qdrant filter from request filters and user roles.
    Enforces RBAC at the retrieval level.
    """
    conditions = []
    
    # Apply user-provided filters
    if filters:
        if filters.get("manufacturer"):
            conditions.append({
                "key": "manufacturer",
                "match": {"value": filters["manufacturer"]},
            })
        if filters.get("model"):
            conditions.append({
                "key": "model",
                "match": {"value": filters["model"]},
            })
        if filters.get("category"):
            conditions.append({
                "key": "category",
                "match": {"value": filters["category"]},
            })
    
    # Apply RBAC filter
    if user:
        # User can see documents allowed for their roles
        role_filter = {
            "key": "allowed_roles",
            "match": {"any": user.roles},
        }
        conditions.append(role_filter)
    else:
        # Anonymous users can only see public documents
        conditions.append({
            "key": "allowed_roles",
            "match": {"any": ["public"]},
        })
    
    if not conditions:
        return {}
    
    return {"must": conditions}
