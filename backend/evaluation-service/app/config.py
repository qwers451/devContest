from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    ollama_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.1"

    class Config:
        env_file = ".env"


settings = Settings()
