from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
