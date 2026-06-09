"""名片分享记录模型"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class CardShare(Base):
    """名片分享记录"""
    __tablename__ = "card_shares"

    id = Column(Integer, primary_key=True, index=True)
    sharer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    share_type = Column(String(32), nullable=False, default="card")  # card, invite
    share_channel = Column(String(32), nullable=True)  # wechat, moments, qq, etc.
    share_link = Column(String(512), nullable=True)
    share_code = Column(String(64), unique=True, index=True, nullable=False)
    view_count = Column(Integer, default=0)
    register_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    sharer = relationship("User", foreign_keys=[sharer_id])
