"""
Chat Endpoint - Site-wide AI Copilot
Streaming responses with retrieval-augmented generation
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core import User, get_current_user, get_logger
from ..services.rag import retrieve_context, build_prompt
from ..services.ollama_client import stream_chat

router = APIRouter()
logger = get_logger("chat")


class PageContext(BaseModel):
    """Context from the current page."""
    page: str
    door_id: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    door_type: Optional[str] = None
    controller: Optional[str] = None
    site_name: Optional[str] = None


class ChatRequest(BaseModel):
    """Chat request body."""
    message: str = Field(..., min_length=1, max_length=2000)
    context: Optional[PageContext] = None
    conversation_id: Optional[str] = None
    mode: str = Field(default="auto", pattern="^(auto|diagnose|manual|parts)$")


class DiagnosisBlock(BaseModel):
    """Structured diagnosis output."""
    likely_cause: str
    confidence: float = Field(ge=0, le=1)
    category: str


class ChecklistItem(BaseModel):
    """Single troubleshooting step."""
    step: int
    action: str
    manual_ref: Optional[dict] = None


class PartNeeded(BaseModel):
    """Part recommendation."""
    part_number: str
    description: str
    quantity: int = 1


class Source(BaseModel):
    """Citation source."""
    type: str  # "playbook" or "manual"
    id: Optional[str] = None
    manual_id: Optional[str] = None
    page: Optional[int] = None
    relevance: float


class ChatResponse(BaseModel):
    """Final structured response."""
    response_text: str
    diagnosis: Optional[DiagnosisBlock] = None
    checklist: Optional[list[ChecklistItem]] = None
    parts_needed: Optional[list[PartNeeded]] = None
    sources: Optional[list[Source]] = None


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: Optional[User] = Depends(get_current_user),
):
    """
    Site-wide Copilot chat endpoint.
    Returns streaming SSE response with final structured JSON.
    """
    logger.info(
        "Chat request",
        user_sub=user.sub if user else "anonymous",
        mode=request.mode,
        has_context=request.context is not None,
    )
    
    # Check authorization for certain features
    if request.mode in ["diagnose", "manual"] and not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    if user and not user.has_any_role(["Admin", "Tech"]):
        raise HTTPException(status_code=403, detail="Technician access required")
    
    # Build context for retrieval
    context_dict = request.context.model_dump() if request.context else {}
    
    async def generate():
        try:
            # Retrieve relevant documents
            retrieved = await retrieve_context(
                query=request.message,
                mode=request.mode,
                manufacturer=context_dict.get("manufacturer"),
                model=context_dict.get("model"),
                door_type=context_dict.get("door_type"),
            )
            
            # Build prompt with retrieved context
            prompt = build_prompt(
                user_message=request.message,
                page_context=context_dict,
                retrieved_docs=retrieved,
                mode=request.mode,
            )
            
            # Stream response from Ollama
            full_response = ""
            async for token in stream_chat(prompt):
                full_response += token
                # Send token as SSE
                yield f"data: {json.dumps({'token': token})}\n\n"
            
            # Parse structured response
            structured = parse_structured_response(full_response, retrieved)
            
            # Send final structured response
            yield f"data: {json.dumps({'final': structured.model_dump()})}\n\n"
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error("Chat error", error=str(e))
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


def parse_structured_response(
    response_text: str,
    retrieved: list[dict],
) -> ChatResponse:
    """
    Parse LLM response into structured format.
    In production, use Ollama's format parameter for JSON schema enforcement.
    """
    # For now, return basic structure
    # TODO: Implement JSON schema enforcement with Ollama
    sources = [
        Source(
            type=doc.get("type", "playbook"),
            id=doc.get("id"),
            manual_id=doc.get("manual_id"),
            page=doc.get("page"),
            relevance=doc.get("score", 0.0),
        )
        for doc in retrieved[:3]
    ]
    
    return ChatResponse(
        response_text=response_text,
        sources=sources if sources else None,
    )
