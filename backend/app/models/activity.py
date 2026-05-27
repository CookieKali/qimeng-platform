"""活动 - V1.0保留 + V2.0增强"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean

from ..database import Base


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=True)

    title = Column(String(128), nullable=False)
    description = Column(Text, default="")
    cover_url = Column(String(512), default="")
    location = Column(String(255), default="")
    capacity = Column(Integer, default=50)
    signup_deadline = Column(DateTime, nullable=True)
    start_at = Column(DateTime, nullable=True)
    end_at = Column(DateTime, nullable=True)

    # 子任务关联（V2.0）
    sub_tasks = Column(JSON, default=list)   # [task_id...]

    status = Column(String(16), default="open")   # open/closed/cancelled/finished
    created_at = Column(DateTime, default=datetime.utcnow)


class ActivityCheckin(Base):
    __tablename__ = "activity_checkins"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    signed_up_at = Column(DateTime, default=datetime.utcnow)
    checked_in_at = Column(DateTime, nullable=True)
    signed_in = Column(Boolean, default=False)
    signed_in_at = Column(DateTime, nullable=True)
