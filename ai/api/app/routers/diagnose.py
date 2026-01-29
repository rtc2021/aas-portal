"""
Diagnose Endpoint - Quick Door Diagnosis
Non-streaming, optimized for <3s response time
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core import User, require_auth, get_logger
from ..services.rag import retrieve_playbooks
from ..services.ollama_client import generate_diagnosis

router = APIRouter()
logger = get_logger("diagnose")


class DiagnoseRequest(BaseModel):
    """Diagnose request body."""
    door_id: str
    symptom: str = Field(..., min_length=3, max_length=500)
    context: Optional[dict] = None


class DiagnosisResult(BaseModel):
    """Diagnosis output block."""
    likely_cause: str
    confidence: float = Field(ge=0, le=1)
    category: str


class TroubleshootingStep(BaseModel):
    """Single troubleshooting step."""
    step: int
    action: str
    manual_ref: Optional[dict] = None


class PartRecommendation(BaseModel):
    """Recommended part."""
    part_number: str
    description: str
    quantity: int = 1


class SourceCitation(BaseModel):
    """Source citation."""
    type: str
    id: Optional[str] = None
    manual_id: Optional[str] = None
    page: Optional[int] = None
    relevance: float


class DiagnoseResponse(BaseModel):
    """Full diagnosis response."""
    response_text: str
    diagnosis: Optional[DiagnosisResult] = None
    checklist: Optional[list[TroubleshootingStep]] = None
    parts_needed: Optional[list[PartRecommendation]] = None
    sources: Optional[list[SourceCitation]] = None


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(
    request: DiagnoseRequest,
    user: User = Depends(require_auth),
):
    """
    Quick diagnosis endpoint.
    Uses playbook-first approach for deterministic results.
    Target latency: <3 seconds.
    """
    logger.info(
        "Diagnose request",
        user_sub=user.sub,
        door_id=request.door_id,
        symptom_length=len(request.symptom),
    )
    
    # Check role
    if not user.has_any_role(["Admin", "Tech"]):
        raise HTTPException(status_code=403, detail="Technician access required")
    
    context = request.context or {}
    manufacturer = context.get("manufacturer")
    model = context.get("model")
    door_type = context.get("door_type")
    
    try:
        # Step 1: Retrieve relevant playbook nodes
        playbook_nodes = await retrieve_playbooks(
            symptom=request.symptom,
            manufacturer=manufacturer,
            model=model,
            door_type=door_type,
            top_k=3,
        )
        
        if not playbook_nodes:
            # Fallback to general response
            return DiagnoseResponse(
                response_text=f"I don't have specific diagnostic information for this symptom on {manufacturer or 'this'} {model or 'door'}. Please try the Copilot for a more detailed conversation.",
                diagnosis=None,
            )
        
        # Step 2: Use best matching playbook node
        best_match = playbook_nodes[0]
        
        # Step 3: Generate explanation using LLM
        explanation = await generate_diagnosis(
            symptom=request.symptom,
            playbook_node=best_match,
            context=context,
        )
        
        # Step 4: Build structured response
        response = DiagnoseResponse(
            response_text=explanation.get("response_text", ""),
            diagnosis=DiagnosisResult(
                likely_cause=best_match.get("cause", explanation.get("likely_cause", "Unknown")),
                confidence=best_match.get("confidence", 0.7),
                category=best_match.get("category", "general"),
            ),
            checklist=[
                TroubleshootingStep(
                    step=i + 1,
                    action=step.get("action", step) if isinstance(step, dict) else step,
                    manual_ref=step.get("manual_ref") if isinstance(step, dict) else None,
                )
                for i, step in enumerate(best_match.get("steps", []))
            ] or None,
            parts_needed=[
                PartRecommendation(
                    part_number=part.get("part_number", ""),
                    description=part.get("description", ""),
                    quantity=part.get("quantity", 1),
                )
                for part in best_match.get("parts", [])
            ] or None,
            sources=[
                SourceCitation(
                    type="playbook",
                    id=best_match.get("playbook_id"),
                    relevance=best_match.get("score", 0.9),
                )
            ],
        )
        
        logger.info(
            "Diagnose complete",
            user_sub=user.sub,
            has_diagnosis=response.diagnosis is not None,
            num_steps=len(response.checklist) if response.checklist else 0,
        )
        
        return response
        
    except Exception as e:
        logger.error("Diagnose error", error=str(e), door_id=request.door_id)
        raise HTTPException(status_code=500, detail=f"Diagnosis failed: {str(e)}")
