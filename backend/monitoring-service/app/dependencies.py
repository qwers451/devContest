import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

security = HTTPBearer(auto_error=False)


def _decode_user(credentials: HTTPAuthorizationCredentials | None) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {
        "id": int(payload["sub"]),
        "role": payload["role"],
        "login": payload["login"],
    }


def require_admin_or_internal(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    x_internal_secret: str | None = Header(None),
) -> dict:
    if x_internal_secret and x_internal_secret == settings.internal_secret:
        return {"auth_type": "internal"}

    user = _decode_user(credentials)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user
