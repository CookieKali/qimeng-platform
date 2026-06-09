"""模块6：靠谱度信用体系 - 双角色独立 + 专业标签"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.reputation import ReputationRecord, ReputationTag
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/reputation", tags=["reputation"])


@router.get("/")
def reputation(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    records = db.query(ReputationRecord).filter(
        ReputationRecord.user_id == user.id
    ).order_by(ReputationRecord.created_at.desc()).limit(50).all()
    return ok({
        "level": user.reputation_level,
        "initiator_score": user.reputation_initiator,
        "executor_score": user.reputation_executor,
        "dimensions": [
            {"name": "基础履约", "weight": 40},
            {"name": "交付质量", "weight": 30},
            {"name": "专业适配", "weight": 20},
            {"name": "平台合规", "weight": 10},
        ],
        "records": [{
            "id": r.id, "role": r.role_type, "dimension": r.dimension,
            "delta": r.delta, "task_id": r.task_id, "detail": r.detail,
            "at": r.created_at,
        } for r in records],
    })


@router.get("/tags")
def tags(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(ReputationTag).filter(
        ReputationTag.user_id == user.id, ReputationTag.status == "active"
    ).all()
    return ok({"items": [{
        "id": t.id, "name": t.tag_name, "level": t.tag_level,
        "source": t.source, "valid_until": t.valid_until,
    } for t in items]})


@router.post("/repair")
def repair(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """信用修复 - 演示用：完成官方任务可加分"""
    if user.reputation_executor < 700:
        user.reputation_executor = min(1000, user.reputation_executor + 30)
        db.add(ReputationRecord(user_id=user.id, role_type="executor",
                                dimension="平台合规", weight=10, delta=30,
                                detail={"修复": "完成官方任务"}))
        db.commit()
        return ok({"score": user.reputation_executor}, msg="已完成1次信用修复任务，+30")
    return ok(msg="信用分已达S级以上，无需修复")
