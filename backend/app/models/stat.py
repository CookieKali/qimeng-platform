"""互动统计 - 共同出现 + 任务合作 + 关系图谱"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint

from ..database import Base


class InteractionStat(Base):
    __tablename__ = "interaction_stats"
    __table_args__ = (UniqueConstraint("user_id", "other_id", name="uq_stat_pair"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    other_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    same_activity_count = Column(Integer, default=0)
    task_coop_count = Column(Integer, default=0)
    last_at = Column(DateTime, default=datetime.utcnow)
