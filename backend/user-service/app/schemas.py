from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    login: str
    password: str
    role: UserRole = UserRole.executor


class UserResponse(BaseModel):
    id: int
    email: str
    login: str
    role: UserRole
    status: int
    created_at: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    login: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ProfileUpdate(BaseModel):
    email: str | None = None
    login: str | None = None
    password: str | None = None
