"""数字名片 - V2.0 四模块架构"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class Card(Base):
    """V2.0四模块：核心认证 + 自定义认证 + 个性化展示 + 生态行为"""
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)

    # 核心认证模块（必填，不可篡改）
    company = Column(String(128), default="")
    job_title = Column(String(64), default="")
    industry = Column(String(64), default="")        # 行业赛道
    region = Column(String(64), default="")          # 所在城市
    bio = Column(String(255), default="")            # 一句话身份描述

    # 自定义认证模块（审核后展示，JSON）
    social_titles = Column(JSON, default=list)       # 社会职务 [{title, duty, since}]
    honors = Column(JSON, default=list)              # 社会荣誉 [{name, year}]
    business_map = Column(JSON, default=list)        # 商业版图 [{co, position, biz, addr, product}]
    qualifications = Column(JSON, default=list)      # 专业资质

    # 个性化展示模块
    interests = Column(Text, default="")
    talents = Column(Text, default="")
    resources = Column(JSON, default=list)           # 资源清单
    needs = Column(JSON, default=list)               # 需求清单
    tags = Column(JSON, default=list)                # 标签

    # 隐私设置
    privacy = Column(JSON, default=dict)             # {"phone": "friend", "email": "public", ...}

    # 动态状态条
    status_supply = Column(Text, default="")         # 我能提供
    status_demand = Column(Text, default="")         # 我的需求
    status_updated_at = Column(DateTime, default=datetime.utcnow)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="card")
