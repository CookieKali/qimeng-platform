"""支付流水 — 微信 out_trade_no 幂等与对账"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text

from ..database import Base


class PaymentRecord(Base):
    __tablename__ = "payment_records"

    id = Column(Integer, primary_key=True, index=True)
    order_type = Column(String(32), nullable=False, default="membership")  # membership
    order_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    out_trade_no = Column(String(32), unique=True, index=True, nullable=False)
    amount = Column(Integer, nullable=False)  # 分
    channel = Column(String(16), default="wechat")  # wechat | mock
    status = Column(String(16), default="pending", index=True)  # pending | paid | failed
    prepay_id = Column(String(64), default="")
    transaction_id = Column(String(64), default="")
    raw_notify = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
