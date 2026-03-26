from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "mistral"
    ollama_vision_model: str = "pixtral:12b"
    evaluation_stub: bool = False
    contest_service_url: str = "http://contest-service:8000"
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
