"""用户表 - 七方生态角色体系"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class User(Base):
    """企盟用户 - 支持V2.0七方生态角色"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # 基础认证
    phone = Column(String(20), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(64), nullable=False, default="")
    avatar_url = Column(String(512), default="")
    email = Column(String(128), default="")

    # 七方角色: normal / paid / partner / station_admin / mentor / investor / kol / super_admin
    role = Column(String(32), default="normal", index=True)

    # 账号状态: pending / active / disabled
    status = Column(String(16), default="active", index=True)

    # 推荐链
    inviter_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    invite_code = Column(String(32), unique=True, index=True)

    # 信用与积分概览
    reputation_initiator = Column(Integer, default=600)  # 发起方信用分
    reputation_executor = Column(Integer, default=600)   # 接单方信用分
    reputation_level = Column(String(8), default="A")    # SSS/SS/S/A/B/C/D
    credit_balance = Column(Integer, default=0)          # 任务交易积分余额
    contribution_balance = Column(Integer, default=0)    # 生态贡献积分余额

    # 实名/付费
    is_verified = Column(Boolean, default=False)
    is_paid = Column(Boolean, default=False)
    paid_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    card = relationship("Card", back_populates="user", uselist=False, cascade="all, delete-orphan")
    inviter = relationship("User", remote_side=[id])
