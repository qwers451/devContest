import asyncio
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    yookassa_payout_secret_key: str = ""
    yookassa_payout_agent_id: str = ""
    yookassa_return_url: str = "http://localhost:3000/payment/callback"
    frontend_url: str = "http://localhost:3000"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    contest_service_url: str = "http://contest-service:8000"

    class Config:
        env_file = ".env"

settings = Settings()

_yk_lock = None

def get_yk_lock() -> asyncio.Lock:
    global _yk_lock
    if _yk_lock is None:
        _yk_lock = asyncio.Lock()
    return _yk_lock
