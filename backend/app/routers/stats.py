"""模块12：互动统计 + 关系图谱（基础数据接口）"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.stat import InteractionStat
from ..models.reputation import ReputationRecord
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/statistics", tags=["stats"])


@router.get("/interaction")
def interaction_list(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = []
    for s in db.query(InteractionStat).filter(InteractionStat.user_id == user.id).all():
        o = db.query(User).filter(User.id == s.other_id).first()
        if not o:
            continue
        items.append({
            "id": o.id, "name": o.name,
            "same_activity": s.same_activity_count,
            "task_coop": s.task_coop_count, "last_at": s.last_at,
        })
    items.sort(key=lambda x: -(x["same_activity"] + x["task_coop"]))
    return ok({"items": items, "total": len(items)})


@router.get("/reputation-curve")
def curve(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """信用分变化曲线"""
    records = db.query(ReputationRecord).filter(
        ReputationRecord.user_id == user.id
    ).order_by(ReputationRecord.created_at.asc()).all()
    base = 600
    points = [{"at": None, "score": base}]
    score = base
    for r in records:
        score = max(0, min(1000, score + r.delta))
        points.append({"at": r.created_at, "score": score, "dimension": r.dimension})
    return ok({"points": points, "current": user.reputation_executor})
