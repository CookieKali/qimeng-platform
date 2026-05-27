"""贡献积分兑换的推荐位（流量扶持载体）"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey

from ..database import Base


class Recommendation(Base):
    """推荐位：用户购买后，在有效期内对 task/activity/user 进行曝光扶持"""
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    target_type = Column(String(16), nullable=False)  # task / activity / user
    target_id = Column(Integer, nullable=False)
    expire_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
