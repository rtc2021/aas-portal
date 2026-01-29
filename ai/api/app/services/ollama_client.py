"""
Ollama Client Service
Handles LLM inference for chat and diagnosis
"""

from typing import AsyncGenerator

import ollama

from ..core import get_settings, get_logger

logger = get_logger("ollama")

# Singleton client
_client = None


def get_client():
    """Get or create Ollama client."""
    global _client
    if _client is None:
        settings = get_settings()
        _client = ollama.AsyncClient(host=settings.ollama_host)
    return _client


async def stream_chat(
    prompt: str,
    system: str = None,
) -> AsyncGenerator[str, None]:
    """
    Stream chat completion from Ollama.
    Yields tokens as they're generated.
    """
    settings = get_settings()
    client = get_client()
    
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    try:
        response = await client.chat(
            model=settings.ollama_chat_model,
            messages=messages,
            stream=True,
            options={
                "temperature": 0.7,
                "top_p": 0.9,
            },
            keep_alive=settings.ollama_keep_alive,
        )
        
        async for chunk in response:
            if chunk.get("message", {}).get("content"):
                yield chunk["message"]["content"]
                
    except Exception as e:
        logger.error("Ollama stream error", error=str(e))
        yield f"\n\nError: {str(e)}"


async def generate_diagnosis(
    symptom: str,
    playbook_node: dict,
    context: dict,
) -> dict:
    """
    Generate a diagnosis explanation using playbook as source of truth.
    Non-streaming for faster response.
    """
    settings = get_settings()
    client = get_client()
    
    # Build prompt
    prompt = f"""You are an expert automatic door technician assistant.

Based on the following playbook information, explain the diagnosis to the technician.

## Symptom Reported
{symptom}

## Door Context
- Manufacturer: {context.get('manufacturer', 'Unknown')}
- Model: {context.get('model', 'Unknown')}
- Door Type: {context.get('door_type', 'Unknown')}

## Playbook Match
- Likely Cause: {playbook_node.get('cause', 'Unknown')}
- Category: {playbook_node.get('category', 'General')}
- Steps: {playbook_node.get('steps', [])}
- Parts: {playbook_node.get('parts', [])}

Provide a clear, concise explanation (2-3 sentences) of what's likely wrong and why the suggested steps will help.
Do not add steps or parts beyond what's in the playbook - it is the source of truth."""

    try:
        response = await client.chat(
            model=settings.ollama_chat_model,
            messages=[{"role": "user", "content": prompt}],
            stream=False,
            options={
                "temperature": 0.3,  # Lower for more deterministic
                "top_p": 0.8,
            },
            keep_alive=settings.ollama_keep_alive,
        )
        
        return {
            "response_text": response.get("message", {}).get("content", ""),
            "likely_cause": playbook_node.get("cause", "Unknown"),
        }
        
    except Exception as e:
        logger.error("Ollama diagnosis error", error=str(e))
        return {
            "response_text": f"Unable to generate explanation: {str(e)}",
            "likely_cause": playbook_node.get("cause", "Unknown"),
        }


async def embed_text(text: str) -> list[float]:
    """Generate embedding for text using Ollama."""
    settings = get_settings()
    client = get_client()
    
    try:
        response = await client.embeddings(
            model=settings.ollama_embed_model,
            prompt=text,
        )
        return response.get("embedding", [])
    except Exception as e:
        logger.error("Embedding error", error=str(e))
        return []


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts."""
    embeddings = []
    for text in texts:
        emb = await embed_text(text)
        embeddings.append(emb)
    return embeddings
