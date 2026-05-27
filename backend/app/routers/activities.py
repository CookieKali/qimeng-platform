"""模块7：活动广场"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.activity import Activity, ActivityCheckin
from ..models.friend import FriendRelation
from ..models.stat import InteractionStat
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/activities", tags=["activities"])
v1_router = APIRouter(prefix="/api/v1/activities", tags=["activities"])

ATTENDEE_EXPIRE_DAYS = 15


def _mask_phone(value: str) -> str:
    text = (value or "").strip()
    if len(text) >= 7:
        return text[:3] + "****" + text[-4:]
    if len(text) >= 4:
        return text[:2] + "****"
    return "****"


def _mask_two_chars(value: str) -> str:
    text = (value or "").strip()
    if len(text) >= 2:
        return text[:2] + "**"
    if len(text) == 1:
        return text + "**"
    return "**"


def _is_friend(db: Session, viewer_id: int, target_id: int) -> bool:
    return db.query(FriendRelation).filter(
        FriendRelation.user_id == viewer_id,
        FriendRelation.friend_id == target_id,
    ).first() is not None


def _activity_attendees_expired(activity: Activity, now: datetime) -> bool:
    end_at = activity.end_at
    if not end_at:
        return False
    return (now - end_at) > timedelta(days=ATTENDEE_EXPIRE_DAYS)


def _bump_same_activity_stats(db: Session, activity_id: int, user_id: int) -> None:
    others = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == activity_id,
        ActivityCheckin.user_id != user_id,
        ActivityCheckin.checked_in_at.isnot(None),
    ).all()
    for o in others:
        for u_id, o_id in [(user_id, o.user_id), (o.user_id, user_id)]:
            s = db.query(InteractionStat).filter(
                InteractionStat.user_id == u_id,
                InteractionStat.other_id == o_id,
            ).first()
            if not s:
                s = InteractionStat(user_id=u_id, other_id=o_id)
                db.add(s)
            s.same_activity_count = (s.same_activity_count or 0) + 1
            s.last_at = datetime.utcnow()


class ActivityCreate(BaseModel):
    title: str
    description: str = ""
    cover_url: str = ""
    location: str = ""
    capacity: int = 50
    space_id: Optional[int] = None
    station_id: Optional[int] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    signup_deadline: Optional[datetime] = None


@router.get("/my/signups")
def my_signups(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ids = [
        c.activity_id
        for c in db.query(ActivityCheckin).filter(ActivityCheckin.user_id == user.id).all()
    ]
    return ok({"ids": ids})


@router.get("/")
def list_activities(status: str = "全部", db: Session = Depends(get_db)):
    q = db.query(Activity)
    if status != "全部":
        q = q.filter(Activity.status == status)
    items = []
    for a in q.order_by(Activity.start_at.desc()).all():
        host = db.query(User).filter(User.id == a.host_id).first()
        signups = db.query(ActivityCheckin).filter(ActivityCheckin.activity_id == a.id).count()
        items.append({
            "id": a.id, "title": a.title, "description": a.description,
            "cover_url": a.cover_url, "location": a.location,
            "host_name": host.name if host else "", "host_id": a.host_id,
            "capacity": a.capacity, "signups": signups,
            "start_at": a.start_at, "end_at": a.end_at, "status": a.status,
        })
    return ok({"items": items, "total": len(items)})


@router.post("/")
def create_activity(payload: ActivityCreate,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_paid and user.role not in ("paid", "partner", "station_admin", "mentor", "super_admin"):
        raise HTTPException(403, "活动发起仅限付费用户")
    a = Activity(host_id=user.id, **payload.dict())
    db.add(a)
    db.commit()
    db.refresh(a)
    return ok({"id": a.id}, msg="活动已发布")


@router.get("/{activity_id}")
def activity_detail(activity_id: int, db: Session = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "活动不存在")
    host = db.query(User).filter(User.id == a.host_id).first()
    checkins = db.query(ActivityCheckin).filter(ActivityCheckin.activity_id == a.id).all()
    return ok({
        "id": a.id, "title": a.title, "description": a.description,
        "cover_url": a.cover_url, "location": a.location,
        "host_id": a.host_id, "host_name": host.name if host else "",
        "capacity": a.capacity, "start_at": a.start_at, "end_at": a.end_at,
        "signup_deadline": a.signup_deadline, "status": a.status,
        "checkins": [{"user_id": c.user_id, "signed_up_at": c.signed_up_at,
                      "checked_in_at": c.checked_in_at} for c in checkins],
    })


@router.post("/{activity_id}/signup")
def signup(activity_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "活动不存在")
    if db.query(ActivityCheckin).filter(ActivityCheckin.activity_id == activity_id,
                                        ActivityCheckin.user_id == user.id).first():
        return ok(msg="已报名")
    db.add(ActivityCheckin(activity_id=activity_id, user_id=user.id))
    db.commit()
    return ok(msg="报名成功")


@v1_router.post("/{activity_id}/signin/{user_id}")
def host_confirm_signin(
    activity_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发起人确认某报名用户到场签到"""
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "活动不存在")
    if a.host_id != user.id:
        raise HTTPException(403, "仅活动发起人可确认签到")
    ck = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == activity_id,
        ActivityCheckin.user_id == user_id,
    ).first()
    if not ck:
        raise HTTPException(404, "该用户未报名此活动")
    if not ck.signed_in:
        ck.signed_in = True
        ck.signed_in_at = datetime.utcnow()
    db.commit()
    return ok({"user_id": user_id, "signed_in": True}, msg="签到已确认")


@v1_router.post("/{activity_id}/checkin")
def v1_checkin(activity_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """现场签到（须已报名）"""
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "活动不存在")
    c = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == activity_id,
        ActivityCheckin.user_id == user.id,
    ).first()
    if not c:
        raise HTTPException(400, "请先报名")
    if c.checked_in_at:
        return ok({"hint": "already_checked_in"}, msg="已签到")
    c.checked_in_at = datetime.utcnow()
    _bump_same_activity_stats(db, activity_id, user.id)
    db.commit()
    return ok(msg="签到成功")


def _host_signup_attendees(db: Session, activity_id: int):
    """发起人查看全部报名名单（含签到状态）"""
    rows = (
        db.query(ActivityCheckin)
        .filter(ActivityCheckin.activity_id == activity_id)
        .order_by(ActivityCheckin.signed_up_at.asc())
        .all()
    )
    items = []
    for ck in rows:
        u = db.query(User).filter(User.id == ck.user_id, User.status == "active").first()
        if not u:
            continue
        items.append({
            "user_id": u.id,
            "name": u.name or "",
            "phone": _mask_phone(u.phone),
            "reputation_level": u.reputation_level or "B",
            "signed_in": bool(ck.signed_in),
            "signed_in_at": ck.signed_in_at.isoformat() if ck.signed_in_at else None,
        })
    return ok({"items": items, "total": len(items)})


@v1_router.get("/{activity_id}/attendees")
def list_attendees(
    activity_id: int,
    page: int = 1,
    page_size: int = 20,
    manage: bool = Query(False, description="发起人人查看报名名单"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """到场人员（仅已签到用户可查看，超期脱敏）；manage=1 时发起人查看报名名单"""
    a = db.query(Activity).filter(Activity.id == activity_id).first()
    if not a:
        raise HTTPException(404, "活动不存在")
    if manage:
        if a.host_id != user.id:
            raise HTTPException(403, "仅活动发起人可查看报名名单")
        return _host_signup_attendees(db, activity_id)
    mine = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == activity_id,
        ActivityCheckin.user_id == user.id,
    ).first()
    if not mine or not mine.checked_in_at:
        raise HTTPException(403, "请先完成现场签到")

    now = datetime.utcnow()
    is_expired = _activity_attendees_expired(a, now)

    q = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == activity_id,
        ActivityCheckin.checked_in_at.isnot(None),
    ).order_by(ActivityCheckin.checked_in_at.asc())
    total = q.count()
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for ck in rows:
        u = db.query(User).filter(User.id == ck.user_id, User.status == "active").first()
        if not u:
            continue
        card = u.card
        raw_name = u.name or ""
        raw_co = (card.company if card else "") or ""
        raw_job = (card.job_title if card else "") or ""
        if is_expired:
            display_name = _mask_two_chars(raw_name)
            display_co = _mask_two_chars(raw_co)
            display_job = ""
            name_abbr = (display_name.replace("**", "") or "**")[:2]
        else:
            display_name = raw_name
            display_co = raw_co
            display_job = raw_job
            name_abbr = raw_name[:2] if raw_name else ""
        items.append({
            "id": u.id,
            "name": display_name,
            "nameAbbr": name_abbr,
            "job": display_job,
            "co": display_co,
            "avatar_url": "" if is_expired else (u.avatar_url or ""),
            "is_friend": _is_friend(db, user.id, u.id),
            "is_expired": is_expired,
            "is_me": u.id == user.id,
        })

    return ok({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "is_expired": is_expired,
    })


@router.post("/{activity_id}/checkin")
def checkin(activity_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(ActivityCheckin).filter(ActivityCheckin.activity_id == activity_id,
                                         ActivityCheckin.user_id == user.id).first()
    if not c:
        raise HTTPException(400, "请先报名")
    if c.checked_in_at:
        return ok(msg="已签到")
    c.checked_in_at = datetime.utcnow()
    _bump_same_activity_stats(db, activity_id, user.id)
    db.commit()
    return ok(msg="签到成功")


@router.get("/{activity_id}/circle")
def common_circle(activity_id: int, db: Session = Depends(get_db)):
    """共同活动圈 - 同活动参与者"""
    cs = db.query(ActivityCheckin).filter(ActivityCheckin.activity_id == activity_id).all()
    items = []
    for c in cs:
        u = db.query(User).filter(User.id == c.user_id).first()
        if u:
            card = u.card
            items.append({"id": u.id, "name": u.name, "avatar_url": u.avatar_url or "",
                          "company": card.company if card else "",
                          "job_title": card.job_title if card else "",
                          "checked_in": c.checked_in_at is not None})
    return ok({"items": items, "total": len(items)})
