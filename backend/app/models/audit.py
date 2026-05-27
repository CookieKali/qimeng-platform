"""审核记录 - 付费会员双重审核"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey

from ..database import Base


class AuditRecord(Base):
    __tablename__ = "audit_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(24), default="paid_member")    # paid_member/station_join/shareholder
    inviter_status = Column(String(16), default="pending")  # 推荐人审核
    admin_status = Column(String(16), default="pending")    # 管理员审核
    reason = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
