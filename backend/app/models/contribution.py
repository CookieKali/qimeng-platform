"""V2.1 生态贡献积分流水"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from ..database import Base


class ContributionPoint(Base):
    """生态贡献积分（不可转让）"""
    __tablename__ = "contribution_points"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # invite_register/invite_paid/station_intro/activity_promote/deal_match/task_complete/content/eco_build
    source_type = Column(String(32), nullable=False)
    amount = Column(Integer, nullable=False)
    balance = Column(Integer, default=0)
    related_entity = Column(String(64), default="")   # task_xx / activity_xx / user_xx
    note = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
