"""好友私信"""
from datetime import datetime

from sqlalchemy import Column, Integer, Text, DateTime, Boolean, ForeignKey, Index

from ..database import Base


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_from_to", "from_user_id", "to_user_id"),
        Index("ix_messages_to_read", "to_user_id", "is_read"),
    )

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, nullable=False, default="")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
