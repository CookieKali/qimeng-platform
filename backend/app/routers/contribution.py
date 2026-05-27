"""贡献积分消耗 — 流量扶持 / 信用加速 / 权益兑换"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.task import Task
from ..models.activity import Activity
from ..models.contribution import ContributionPoint
from ..models.recommendation import Recommendation
from ..models.reputation import ReputationRecord
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/contribution", tags=["contribution"])

SCENE_COST = {
    "traffic_boost": 500,
    "credit_accel": 200,
    "perk": 1000,
}

VALID_TARGET_TYPES = {"task", "activity", "user"}


class ConsumeIn(BaseModel):
    scene: str
    target_type: str | None = None
    target_id: int | None = None


def _update_reputation_level(user: User):
    score = user.reputation_executor
    for lv, mn in [("SSS", 900), ("SS", 800), ("S", 700), ("A", 600),
                   ("B", 500), ("C", 400), ("D", 0)]:
        if score >= mn:
            user.reputation_level = lv
            break


def _validate_target(db: Session, target_type: str, target_id: int):
    if target_type not in VALID_TARGET_TYPES:
        raise HTTPException(400, "target_type 须为 task / activity / user")
    if target_type == "task":
        if not db.query(Task).filter(Task.id == target_id).first():
            raise HTTPException(404, "任务不存在")
    elif target_type == "activity":
        if not db.query(Activity).filter(Activity.id == target_id).first():
            raise HTTPException(404, "活动不存在")
    elif target_type == "user":
        if not db.query(User).filter(User.id == target_id).first():
            raise HTTPException(404, "用户不存在")


@router.get("/balance")
def contribution_balance(user: User = Depends(get_current_user)):
    return ok({"contribution_balance": user.contribution_balance})


@router.post("/consume")
def consume(
    payload: ConsumeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scene = payload.scene
    cost = SCENE_COST.get(scene)
    if cost is None:
        raise HTTPException(400, f"未知消耗场景: {scene}")

    if user.contribution_balance < cost:
        raise HTTPException(400, "贡献积分不足")

    related_entity = ""
    effect: dict = {"scene": scene}

    if scene == "traffic_boost":
        if not payload.target_type or payload.target_id is None:
            raise HTTPException(400, "traffic_boost 须传 target_type 与 target_id")
        _validate_target(db, payload.target_type, payload.target_id)
        expire_at = datetime.utcnow() + timedelta(hours=24)
        rec = Recommendation(
            user_id=user.id,
            target_type=payload.target_type,
            target_id=payload.target_id,
            expire_at=expire_at,
        )
        db.add(rec)
        db.flush()
        related_entity = f"{payload.target_type}_{payload.target_id}"
        effect = {
            "recommendation_id": rec.id,
            "target_type": payload.target_type,
            "target_id": payload.target_id,
            "expire_at": expire_at.isoformat(),
        }

    elif scene == "credit_accel":
        before = user.reputation_executor
        user.reputation_executor = min(1000, before + 10)
        actual_delta = user.reputation_executor - before
        _update_reputation_level(user)
        db.add(ReputationRecord(
            user_id=user.id,
            role_type="executor",
            dimension="积分加速",
            weight=0,
            delta=actual_delta,
            detail={"scene": "credit_accel", "cost": cost},
        ))
        related_entity = f"user_{user.id}"
        effect = {
            "reputation_executor_before": before,
            "reputation_executor_after": user.reputation_executor,
            "delta": actual_delta,
            "reputation_level": user.reputation_level,
        }

    elif scene == "perk":
        related_entity = f"user_{user.id}"
        effect = {"perk": "权益兑换", "status": "redeemed"}

    balance_after = user.contribution_balance - cost
    user.contribution_balance = balance_after
    db.add(ContributionPoint(
        user_id=user.id,
        source_type=f"consume_{scene}",
        amount=-cost,
        balance=balance_after,
        related_entity=related_entity,
        note={"traffic_boost": "流量扶持推荐位", "credit_accel": "信用加速", "perk": "权益兑换"}[scene],
    ))
    db.commit()

    return ok({
        "scene": scene,
        "cost": cost,
        "balance_after": balance_after,
        "effect": effect,
    })
