from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    yookassa_return_url: str = "http://localhost:5173/payment/callback"
    frontend_url: str = "http://localhost:5173"
    contest_service_url: str = "http://contest-service:8000"

    class Config:
        env_file = ".env"


settings = Settings()
