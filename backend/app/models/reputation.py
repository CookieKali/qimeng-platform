"""信用体系 - 双角色独立核算 + 专业标签"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey

from ..database import Base


class ReputationRecord(Base):
    """每次合作对信用分的影响记录"""
    __tablename__ = "reputation_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role_type = Column(String(16), default="executor")   # initiator / executor
    dimension = Column(String(16), default="基础履约")    # 基础履约/交付质量/专业适配/平台合规
    weight = Column(Integer, default=40)                 # 该维度权重
    delta = Column(Integer, default=0)                   # 本次分数变动
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    evaluator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    detail = Column(JSON, default=dict)                  # 详细评分细节
    period = Column(String(16), default="")              # YYYY-MM
    created_at = Column(DateTime, default=datetime.utcnow)


class ReputationTag(Base):
    """专业标签 - 自动生成/认证升级/动态取消"""
    __tablename__ = "reputation_tags"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tag_name = Column(String(64), nullable=False)
    tag_level = Column(String(16), default="L1")          # L1/L2/L3
    source = Column(String(16), default="auto")           # auto / certified
    valid_until = Column(DateTime, nullable=True)
    status = Column(String(16), default="active")          # active / revoked
    created_at = Column(DateTime, default=datetime.utcnow)
