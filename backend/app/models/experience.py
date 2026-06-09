"""合伙人体验消费额度（会费 36% 赠送额度）"""
from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey

from ..database import Base


class ExperienceQuota(Base):
    """体验消费额度：累计赠送与已使用（单位：分）"""
    __tablename__ = "experience_quotas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    total = Column(Integer, default=0)   # 累计赠送额度（分）
    used = Column(Integer, default=0)    # 已使用（分）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
