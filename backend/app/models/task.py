"""任务全生命周期 - V2.0 核心模块"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String(128), nullable=False)
    description = Column(Text, default="")
    category = Column(String(64), default="")             # 咨询/设计/推广/法务...
    total_quota = Column(Integer, default=1)
    max_quota_per_person = Column(Integer, default=1)

    signup_deadline = Column(DateTime, nullable=True)
    deliver_deadline = Column(DateTime, nullable=True)
    review_cycle_days = Column(Integer, default=3)

    # 准入门槛
    min_reputation_level = Column(String(8), default="B")
    min_completion_rate = Column(Integer, default=0)
    required_tags = Column(JSON, default=list)

    # 验收标准
    qualified_threshold = Column(Text, default="")        # 硬性合格红线
    extra_credit_rules = Column(JSON, default=list)       # 加分项

    # 结算规则
    total_credit_pool = Column(Integer, default=0)
    base_credit_per_person = Column(Integer, default=0)
    satisfaction_ratio_map = Column(JSON, default=dict)   # 满意度→兑付比例
    extra_incentive = Column(Integer, default=0)

    # 违约与申诉
    appeal_rules = Column(Text, default="")

    status = Column(String(16), default="open", index=True)   # open/in_progress/completed/cancelled
    credit_frozen = Column(Boolean, default=False)            # 是否已冻结积分
    completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    host = relationship("User", foreign_keys=[host_id])


class TaskParticipant(Base):
    """任务报名/录用/交付/验收"""
    __tablename__ = "task_participants"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    status = Column(String(16), default="applied")   # applied/accepted/rejected/submitted/reviewed
    submission = Column(Text, default="")            # 交付物
    progress_notes = Column(JSON, default=list)      # 进度沟通流水

    # 验收评分（4维度，权重 40/30/20/10）
    score_performance = Column(Integer, default=0)  # 履约
    score_quality = Column(Integer, default=0)      # 质量
    score_professional = Column(Integer, default=0) # 专业
    score_compliance = Column(Integer, default=0)   # 合规
    satisfaction = Column(Integer, default=0)        # 综合 0-100
    pay_ratio = Column(Integer, default=0)           # 实际兑付比例 (百分点)
    paid_credit = Column(Integer, default=0)         # 实际兑付积分

    applied_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)


class TaskAppeal(Base):
    """任务申诉/仲裁"""
    __tablename__ = "task_appeals"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    appellant_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    respondent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(Text, default="")
    evidence = Column(JSON, default=list)
    status = Column(String(16), default="pending")    # pending/resolved/rejected
    verdict = Column(Text, default="")
    arbitrator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

