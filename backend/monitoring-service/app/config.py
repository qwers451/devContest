from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    internal_secret: str
    user_service_url: str = "http://user-service:8000"
    contest_service_url: str = "http://contest-service:8000"
    evaluation_service_url: str = "http://evaluation-service:8000"
    payment_service_url: str = "http://payment-service:8000"
    protocol_service_url: str = "http://protocol-service:8000"
    audit_service_url: str = "http://audit-service:8000"
    monitoring_service_url: str = "http://monitoring-service:8000"
    request_timeout_seconds: float = 3.0
    allowed_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"

    def monitored_services(self) -> dict[str, str]:
        return {
            "user-service": self.user_service_url,
            "contest-service": self.contest_service_url,
            "evaluation-service": self.evaluation_service_url,
            "payment-service": self.payment_service_url,
            "protocol-service": self.protocol_service_url,
            "audit-service": self.audit_service_url,
            "monitoring-service": self.monitoring_service_url,
        }


settings = Settings()
