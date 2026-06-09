"""成员名片扩展资料（与 cards 表同步展示）"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey

from ..database import Base


class MemberProfile(Base):
    __tablename__ = "member_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False, index=True)
    company = Column(String(128), nullable=True)
    city = Column(String(64), nullable=True)
    personal_value = Column(Text, nullable=True)
    talents_text = Column(Text, nullable=True)
    resources_text = Column(Text, nullable=True)
    needs_text = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
