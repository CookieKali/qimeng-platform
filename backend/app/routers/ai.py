"""模块10：AI 智能匹配 + 风控（演示用：基于标签/区域规则匹配，非真实向量检索）"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List

from ..database import get_db
from ..models.user import User
from ..models.task import Task
from ..models.activity import Activity
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


class MatchIn(BaseModel):
    keywords: List[str] = []
    scene: str = "resource"   # resource/task/circle/activity


@router.post("/match")
def match(payload: MatchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """四维匹配：演示用规则版"""
    me_card = user.card
    me_tags = (me_card.tags or []) if me_card else []
    me_region = me_card.region if me_card else ""

    result = {"users": [], "tasks": [], "activities": [], "scene": payload.scene}

    # 用户匹配
    for u in db.query(User).filter(User.id != user.id).limit(50).all():
        c = u.card
        if not c:
            continue
        score = 0
        for t in (c.tags or []):
            if t in me_tags or t in payload.keywords:
                score += 30
        if c.region == me_region and me_region:
            score += 20
        if score > 0:
            result["users"].append({
                "id": u.id, "name": u.name, "score": score,
                "avatar_url": u.avatar_url or "",
                "company": c.company, "job_title": c.job_title,
                "region": c.region, "tags": c.tags,
                "reputation_level": u.reputation_level,
            })
    result["users"].sort(key=lambda x: -x["score"])
    result["users"] = result["users"][:10]

    # 任务匹配
    if payload.scene in ("task", "resource"):
        for t in db.query(Task).filter(Task.status == "open").limit(30).all():
            score = 0
            for tag in (t.required_tags or []):
                if tag in me_tags or tag in payload.keywords:
                    score += 40
            if score > 0:
                result["tasks"].append({"id": t.id, "title": t.title, "score": score,
                                        "base_credit": t.base_credit_per_person})
        result["tasks"].sort(key=lambda x: -x["score"])
        result["tasks"] = result["tasks"][:5]

    # 活动匹配
    if payload.scene in ("activity", "circle"):
        for a in db.query(Activity).filter(Activity.status == "open").limit(20).all():
            result["activities"].append({"id": a.id, "title": a.title, "location": a.location})
        result["activities"] = result["activities"][:5]

    return ok(result)


@router.post("/risk/check")
def risk_check(transaction_amount: int = 0, user: User = Depends(get_current_user)):
    """交易风控演示：异常金额检测"""
    risk = "low"
    if transaction_amount > 100000:
        risk = "high"
    elif transaction_amount > 10000:
        risk = "medium"
    return ok({"risk": risk, "user_level": user.reputation_level,
               "amount": transaction_amount, "allow": risk != "high"})
