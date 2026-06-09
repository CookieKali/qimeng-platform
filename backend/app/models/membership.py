"""合伙人会员订单"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from ..database import Base


class MembershipOrder(Base):
    """会员订单：basic / pro / flagship"""
    __tablename__ = "membership_orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tier = Column(String(16), nullable=False)  # basic / pro / flagship
    amount = Column(Integer, nullable=False)   # 金额（分）
    status = Column(String(16), default="pending")  # pending / paid / cancelled
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
    note = Column(String(255), nullable=True)
