from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    user_service_url: str = "http://user-service:8000"
    payment_service_url: str = "http://payment-service:8000"
    evaluation_service_url: str = "http://evaluation-service:8000"
    uploads_dir: str = "/app/uploads"
    frontend_url: str = "http://localhost:3000"
    # Почта: пустой smtp_host отключает рассылку
    smtp_host: str = ""
    smtp_port: int = 1025
    smtp_from: str = "devContest <noreply@devcontest.local>"
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = False
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
