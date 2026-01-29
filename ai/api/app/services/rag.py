"""
RAG Service - Retrieval Augmented Generation
Orchestrates document retrieval and prompt construction
"""

from typing import Optional

from ..core import get_settings, get_logger
from .qdrant_store import search_collection

logger = get_logger("rag")


async def retrieve_context(
    query: str,
    mode: str = "auto",
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
    door_type: Optional[str] = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Retrieve relevant documents based on query and mode.
    
    Modes:
    - auto: Classify intent and route appropriately
    - diagnose: Prioritize playbooks
    - manual: Prioritize manual chunks
    - parts: Prioritize parts catalog
    """
    settings = get_settings()
    
    # Build filter based on context
    filters = {}
    if manufacturer:
        filters["manufacturer"] = manufacturer
    if model:
        filters["model"] = model
    
    filter_conditions = {"must": []}
    for key, value in filters.items():
        filter_conditions["must"].append({
            "key": key,
            "match": {"value": value},
        })
    
    # Route based on mode
    if mode == "diagnose":
        # Primary: playbooks, secondary: manuals
        playbook_results = await search_collection(
            collection=settings.qdrant_collection_playbooks,
            query=query,
            filter_conditions=filter_conditions if filter_conditions["must"] else None,
            top_k=top_k,
        )
        return [{"type": "playbook", **r} for r in playbook_results]
    
    elif mode == "manual":
        # Manual chunks only
        manual_results = await search_collection(
            collection=settings.qdrant_collection_manuals,
            query=query,
            filter_conditions=filter_conditions if filter_conditions["must"] else None,
            top_k=top_k,
        )
        return [{"type": "manual", **r} for r in manual_results]
    
    elif mode == "parts":
        # Parts catalog
        parts_results = await search_collection(
            collection=settings.qdrant_collection_parts,
            query=query,
            filter_conditions=filter_conditions if filter_conditions["must"] else None,
            top_k=top_k,
        )
        return [{"type": "parts", **r} for r in parts_results]
    
    else:  # auto mode
        # Classify intent and retrieve from appropriate sources
        intent = classify_intent(query)
        
        if intent == "diagnose":
            return await retrieve_context(query, "diagnose", manufacturer, model, door_type, top_k)
        elif intent == "manual":
            return await retrieve_context(query, "manual", manufacturer, model, door_type, top_k)
        elif intent == "parts":
            return await retrieve_context(query, "parts", manufacturer, model, door_type, top_k)
        else:
            # Mixed retrieval
            playbook_results = await search_collection(
                collection=settings.qdrant_collection_playbooks,
                query=query,
                filter_conditions=filter_conditions if filter_conditions["must"] else None,
                top_k=3,
            )
            manual_results = await search_collection(
                collection=settings.qdrant_collection_manuals,
                query=query,
                filter_conditions=filter_conditions if filter_conditions["must"] else None,
                top_k=2,
            )
            
            results = [{"type": "playbook", **r} for r in playbook_results]
            results.extend([{"type": "manual", **r} for r in manual_results])
            return results


async def retrieve_playbooks(
    symptom: str,
    manufacturer: Optional[str] = None,
    model: Optional[str] = None,
    door_type: Optional[str] = None,
    top_k: int = 3,
) -> list[dict]:
    """
    Retrieve playbook nodes matching a symptom.
    Used by the diagnose endpoint for deterministic troubleshooting.
    """
    settings = get_settings()
    
    # Build strict filter for manufacturer/model
    filter_conditions = {"must": []}
    if manufacturer:
        filter_conditions["must"].append({
            "key": "manufacturer",
            "match": {"value": manufacturer},
        })
    if model:
        filter_conditions["must"].append({
            "key": "model",
            "match": {"value": model},
        })
    
    results = await search_collection(
        collection=settings.qdrant_collection_playbooks,
        query=symptom,
        filter_conditions=filter_conditions if filter_conditions["must"] else None,
        top_k=top_k,
    )
    
    # Extract and enrich playbook data
    playbook_nodes = []
    for r in results:
        payload = r.get("payload", {})
        playbook_nodes.append({
            "playbook_id": payload.get("playbook_id"),
            "cause": payload.get("cause", "Unknown cause"),
            "category": payload.get("category", "general"),
            "steps": payload.get("steps", []),
            "parts": payload.get("parts", []),
            "confidence": min(r.get("score", 0.5) + 0.2, 1.0),  # Boost confidence for close matches
            "score": r.get("score", 0.0),
        })
    
    return playbook_nodes


def classify_intent(query: str) -> str:
    """
    Classify user query intent.
    Simple keyword-based for now, can upgrade to ML classifier.
    """
    query_lower = query.lower()
    
    # Diagnose patterns
    diagnose_keywords = [
        "won't", "doesn't", "not working", "broken", "stuck",
        "error", "fault", "issue", "problem", "why",
        "slow", "fast", "noise", "beeping", "flashing",
    ]
    
    # Manual/how-to patterns
    manual_keywords = [
        "how to", "how do", "steps", "procedure", "instructions",
        "program", "configure", "set up", "install", "adjust",
        "manual", "documentation",
    ]
    
    # Parts patterns
    parts_keywords = [
        "part number", "part #", "p/n", "sku",
        "replacement", "order", "need a", "where to get",
        "compatible", "fits",
    ]
    
    # Score each intent
    diagnose_score = sum(1 for kw in diagnose_keywords if kw in query_lower)
    manual_score = sum(1 for kw in manual_keywords if kw in query_lower)
    parts_score = sum(1 for kw in parts_keywords if kw in query_lower)
    
    # Return highest scoring intent
    if diagnose_score > manual_score and diagnose_score > parts_score:
        return "diagnose"
    elif manual_score > parts_score:
        return "manual"
    elif parts_score > 0:
        return "parts"
    else:
        return "general"


def build_prompt(
    user_message: str,
    page_context: dict,
    retrieved_docs: list[dict],
    mode: str = "auto",
) -> str:
    """
    Build the final prompt for the LLM with retrieved context.
    """
    # System context
    system = """You are an AI assistant for automatic door technicians at AAS (Automatic Access Solutions).
Your role is to help technicians diagnose issues, find parts, and answer technical questions.

Guidelines:
- Be concise and practical
- Reference specific playbook steps or manual pages when available
- Always prioritize safety
- If uncertain, recommend checking the physical equipment or consulting a senior tech
- Use the retrieved context below as your primary source of truth"""

    # Build context section
    context_parts = []
    
    if page_context:
        door_info = []
        if page_context.get("door_id"):
            door_info.append(f"Door ID: {page_context['door_id']}")
        if page_context.get("manufacturer"):
            door_info.append(f"Manufacturer: {page_context['manufacturer']}")
        if page_context.get("model"):
            door_info.append(f"Model: {page_context['model']}")
        if page_context.get("door_type"):
            door_info.append(f"Type: {page_context['door_type']}")
        
        if door_info:
            context_parts.append("## Current Door\n" + "\n".join(door_info))
    
    if retrieved_docs:
        doc_sections = []
        for i, doc in enumerate(retrieved_docs, 1):
            payload = doc.get("payload", {})
            doc_type = doc.get("type", "unknown")
            
            if doc_type == "playbook":
                section = f"### Playbook Match {i}\n"
                section += f"- Cause: {payload.get('cause', 'Unknown')}\n"
                section += f"- Category: {payload.get('category', 'General')}\n"
                if payload.get("steps"):
                    section += "- Steps:\n" + "\n".join(f"  {j}. {s}" for j, s in enumerate(payload["steps"], 1))
            elif doc_type == "manual":
                section = f"### Manual Reference {i}\n"
                section += f"- Manual: {payload.get('manual_id', 'Unknown')}\n"
                section += f"- Page: {payload.get('page', 'Unknown')}\n"
                section += f"- Content: {payload.get('text', '')[:500]}"
            else:
                section = f"### Reference {i}\n{payload}"
            
            doc_sections.append(section)
        
        context_parts.append("## Retrieved Context\n" + "\n\n".join(doc_sections))
    
    # Combine prompt
    prompt = f"""{system}

{chr(10).join(context_parts)}

## User Question
{user_message}

Please provide a helpful, accurate response based on the context above."""

    return prompt
