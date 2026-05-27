"""全局搜索"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, cast, String

from ..database import get_db
from ..models.user import User
from ..models.card import Card
from ..models.task import Task
from ..models.activity import Activity
from ..core.response import ok
router = APIRouter(prefix="/api/v1/search", tags=["search"])

SEARCH_LIMIT = 5

_TASK_STATUS_LABEL = {
    "open": "招募中",
    "in_progress": "进行中",
    "completed": "已完成",
    "cancelled": "已取消",
}


@router.get("/")
def global_search(q: str = "", db: Session = Depends(get_db)):
    kw = (q or "").strip()
    if not kw:
        return ok({"users": [], "tasks": [], "activities": [], "total": 0})

    pattern = f"%{kw}%"
    nocase_like = lambda col: col.collate("NOCASE").like(pattern)

    # Users: name / company / job_title
    uq = (
        db.query(User)
        .filter(User.status == "active")
        .options(joinedload(User.card))
        .outerjoin(Card, User.id == Card.user_id)
        .filter(or_(
            nocase_like(User.name),
            nocase_like(Card.company),
            nocase_like(Card.job_title),
        ))
        .distinct()
        .limit(SEARCH_LIMIT)
    )
    user_rows = uq.all()
    users = []
    for u in user_rows:
        c = u.card
        users.append({
            "id": u.id,
            "name": u.name or "",
            "avatar_url": u.avatar_url or "",
            "job_title": (c.job_title if c else "") or "",
            "company": (c.company if c else "") or "",
        })

    # Tasks: title / description
    tq = db.query(Task).filter(or_(
        nocase_like(Task.title),
        cast(Task.description, String).collate("NOCASE").like(pattern),
    )).order_by(Task.created_at.desc()).limit(SEARCH_LIMIT)
    tasks = []
    for t in tq.all():
        tasks.append({
            "id": t.id,
            "title": t.title or "",
            "status": t.status or "open",
            "status_label": _TASK_STATUS_LABEL.get(t.status or "open", t.status or ""),
            "credits": t.base_credit_per_person or 0,
        })

    # Activities: title / location
    aq = db.query(Activity).filter(or_(
        nocase_like(Activity.title),
        nocase_like(Activity.location),
    )).order_by(Activity.start_at.desc()).limit(SEARCH_LIMIT)
    activities = []
    for a in aq.all():
        start = a.start_at.strftime("%Y-%m-%d") if a.start_at else ""
        activities.append({
            "id": a.id,
            "title": a.title or "",
            "start_at": start,
            "location": a.location or "",
        })

    total = len(users) + len(tasks) + len(activities)
    return ok({
        "users": users,
        "tasks": tasks,
        "activities": activities,
        "total": total,
    })
