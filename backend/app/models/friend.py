"""好友关系 - 含场景溯源"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint

from ..database import Base


class FriendRelation(Base):
    """已建立的好友关系"""
    __tablename__ = "friend_relations"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_user_friend"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_name = Column(String(64), default="生态伙伴")  # 分组
    scene = Column(String(64), default="")               # 添加场景：activity_xx/task_xx/recommend
    coop_count = Column(Integer, default=0)              # 合作次数
    created_at = Column(DateTime, default=datetime.utcnow)


class FriendRequest(Base):
    """好友申请"""
    __tablename__ = "friend_requests"

    id = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    msg = Column(String(255), default="")
    status = Column(String(16), default="pending")  # pending/accepted/rejected
    created_at = Column(DateTime, default=datetime.utcnow)
