"""任务交易积分流水"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from ..database import Base


class CreditTransaction(Base):
    """积分流水：充值/任务奖励/冻结/解冻/划转/退回/手续费/兑换"""
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # recharge / task_reward / freeze / unfreeze / transfer_in / transfer_out / refund / fee / write_off
    type = Column(String(24), nullable=False)
    amount = Column(Integer, nullable=False)             # 可正可负
    balance_before = Column(Integer, default=0)
    balance_after = Column(Integer, default=0)
    related_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    fee = Column(Integer, default=0)
    fee_rate = Column(Integer, default=5)                # 千分位
    note = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
