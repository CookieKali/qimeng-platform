"""站内信箱 / 通知"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Index

from ..database import Base

INBOX_TYPES = (
    "friend_request",
    "recommendation",
    "system",
    "task_notify",
    "activity_notify",
    "card_share",
    "task_share",
    "activity_share",
)


class InboxMessage(Base):
    __tablename__ = "inbox_messages"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(32), nullable=False, index=True)
    title = Column(String(128), nullable=False, default="")
    content = Column(Text, default="")
    related_id = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_inbox_to_read", "to_user_id", "is_read"),
    )
