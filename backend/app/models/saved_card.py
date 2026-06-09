"""单向保存名片（非好友关系）"""
from datetime import datetime

from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint

from ..database import Base


class SavedCard(Base):
    __tablename__ = "saved_cards"
    __table_args__ = (
        UniqueConstraint("from_user_id", "saved_user_id", name="uq_saved_card_pair"),
    )

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    saved_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True, default=None)
