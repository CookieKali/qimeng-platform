from typing import Optional
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    phone: str = Field(..., min_length=6, max_length=20)
    password: str = Field(..., min_length=4, max_length=64)
    name: str = Field("", max_length=64)
    invite_code: Optional[str] = None


class LoginIn(BaseModel):
    phone: str
    password: str


class TokenOut(BaseModel):
    token: str
    user_id: int
    name: str
    role: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
