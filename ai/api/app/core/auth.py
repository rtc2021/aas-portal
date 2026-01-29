"""
Auth0 JWT Authentication
Validates tokens and extracts user info + roles
"""

from typing import Optional
from dataclasses import dataclass, field

import httpx
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError

from .settings import get_settings

security = HTTPBearer(auto_error=False)

# JWKS cache
_jwks_cache: dict = {}


@dataclass
class User:
    """Authenticated user from JWT."""
    sub: str
    email: str = ""
    name: str = ""
    roles: list[str] = field(default_factory=list)
    
    def has_role(self, role: str) -> bool:
        return role in self.roles
    
    def has_any_role(self, roles: list[str]) -> bool:
        return any(r in self.roles for r in roles)


async def get_jwks() -> dict:
    """Fetch and cache Auth0 JWKS."""
    global _jwks_cache
    
    settings = get_settings()
    
    if not settings.auth0_domain:
        return {}
    
    if not _jwks_cache:
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.auth0_jwks_url)
            response.raise_for_status()
            _jwks_cache = response.json()
    
    return _jwks_cache


def get_signing_key(token: str, jwks: dict) -> Optional[str]:
    """Extract the signing key from JWKS for the given token."""
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        return None
    
    for key in jwks.get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return key
    
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> Optional[User]:
    """
    Validate JWT and return current user.
    Returns None if no token provided (allows anonymous access).
    Raises HTTPException if token is invalid.
    """
    settings = get_settings()
    
    # No auth configured - return None (anonymous)
    if not settings.auth0_domain:
        return None
    
    # No token provided - anonymous access
    if not credentials:
        return None
    
    token = credentials.credentials
    
    try:
        jwks = await get_jwks()
        signing_key = get_signing_key(token, jwks)
        
        if not signing_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token signing key",
            )
        
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=settings.auth0_algorithms,
            audience=settings.auth0_audience,
            issuer=settings.auth0_issuer,
        )
        
        # Extract roles from custom claim
        roles_claim = "https://aas-portal.com/roles"
        roles = payload.get(roles_claim, [])
        
        return User(
            sub=payload.get("sub", ""),
            email=payload.get("email", ""),
            name=payload.get("name", ""),
            roles=roles if isinstance(roles, list) else [],
        )
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> User:
    """Require authentication - raises if no valid token."""
    user = await get_current_user(credentials)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    return user


async def require_role(*roles: str):
    """Factory for role-based auth dependency."""
    async def checker(user: User = Security(require_auth)) -> User:
        if not user.has_any_role(list(roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {', '.join(roles)}",
            )
        return user
    return checker


# Pre-built role checkers
require_admin = require_role("Admin")
require_tech = require_role("Admin", "Tech")
