from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    cover_url: str = ""
    category: str = ""
    total_quota: int = 1
    max_quota_per_person: int = 1
    signup_deadline: Optional[datetime] = None
    deliver_deadline: Optional[datetime] = None
    review_cycle_days: int = 3
    min_reputation_level: str = "B"
    required_tags: List[str] = []
    qualified_threshold: str = ""
    extra_credit_rules: List[Dict[str, Any]] = []
    total_credit_pool: int = 0
    base_credit_per_person: int = 0
    satisfaction_ratio_map: Dict[str, int] = {"90": 110, "80": 100, "60": 80, "0": 30}
    extra_incentive: int = 0
    appeal_rules: str = ""


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    category: Optional[str] = None
    deliver_deadline: Optional[datetime] = None
    min_reputation_level: Optional[str] = None


class TaskReview(BaseModel):
    participant_id: int
    score_performance: int = Field(0, description="履约评分")
    score_quality: int = Field(0, description="质量评分")
    score_professional: int = Field(0, description="专业评分")
    score_compliance: int = Field(0, description="合规评分")


class TaskSubmit(BaseModel):
    submission: str


class TaskDeliverCreate(BaseModel):
    content: str
    attachments: List[str] = []


class TaskDeliveryReview(BaseModel):
    action: str  # approve | reject
    reason: Optional[str] = None
    score_performance: Optional[int] = Field(None, ge=0, le=100)
    score_quality: Optional[int] = Field(None, ge=0, le=100)
    score_professional: Optional[int] = Field(None, ge=0, le=100)
    score_compliance: Optional[int] = Field(None, ge=0, le=100)


class TaskAppealIn(BaseModel):
    reason: str = ""

