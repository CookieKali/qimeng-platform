"""模块8+11：空间预约 + 空间站节点 + 联席股东"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.space import Space, Station, StationShareholder, Booking
from ..core.response import ok
from ..deps import get_current_user, get_optional_user

router = APIRouter(prefix="/api/spaces", tags=["spaces"])
v1_router = APIRouter(prefix="/api/v1/spaces", tags=["spaces"])

CANCEL_MIN_HOURS = 2


class BookingCreate(BaseModel):
    space_id: int
    start_time: datetime
    hours: float = 2.0
    activity_id: Optional[int] = None


def _booking_display_status(booking: Booking, now: datetime) -> str:
    if booking.status == "cancelled":
        return "cancelled"
    if booking.start_time <= now:
        return "past"
    return "upcoming"


@v1_router.get("/my-bookings")
def v1_my_bookings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前用户全部空间预约，按开始时间降序"""
    now = datetime.utcnow()
    rows = (
        db.query(Booking)
        .filter(Booking.user_id == user.id)
        .order_by(Booking.start_time.desc())
        .all()
    )
    items = []
    for b in rows:
        space = db.query(Space).filter(Space.id == b.space_id).first()
        items.append({
            "id": b.id,
            "space_id": b.space_id,
            "space_name": space.name if space else "",
            "start_time": b.start_time,
            "hours": b.hours,
            "status": _booking_display_status(b, now),
        })
    return ok({"items": items, "total": len(items)})


@v1_router.delete("/bookings/{booking_id}")
def v1_cancel_booking(
    booking_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取消预约（须距开始时间至少 2 小时）"""
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "预约不存在")
    if b.user_id != user.id:
        raise HTTPException(403, "无权取消该预约")
    if b.status == "cancelled":
        return ok({"cancelled": True}, msg="预约已取消")
    now = datetime.utcnow()
    if b.start_time - now < timedelta(hours=CANCEL_MIN_HOURS):
        raise HTTPException(400, "距开始时间不足2小时，无法取消")
    b.status = "cancelled"
    db.commit()
    return ok({"cancelled": True}, msg="预约已取消")


@router.get("/")
def list_spaces(
    city: str = "全部",
    type: str = "全部",
    keyword: str = "",
    db: Session = Depends(get_db),
):
    q = db.query(Space)
    if type != "全部":
        q = q.filter(Space.type == type)
    kw = (keyword or "").strip()
    if kw:
        pattern = f"%{kw}%"
        q = q.filter(or_(
            Space.name.like(pattern),
            Space.address.like(pattern),
            Space.description.like(pattern),
        ))
    items = []
    for s in q.all():
        st = db.query(Station).filter(Station.id == s.station_id).first() if s.station_id else None
        if city != "全部" and st and st.region != city:
            continue
        items.append({
            "id": s.id, "name": s.name, "type": s.type, "capacity": s.capacity,
            "address": s.address, "cover_url": s.cover_url,
            "price_per_hour": s.price_per_hour, "facilities": s.facilities,
            "available_hours": s.available_hours, "rating": s.rating,
            "station_id": s.station_id, "station_name": st.name if st else "",
            "region": st.region if st else "",
        })
    return ok({"items": items, "total": len(items)})


@router.get("/{space_id}")
def space_detail(space_id: int, db: Session = Depends(get_db)):
    s = db.query(Space).filter(Space.id == space_id).first()
    if not s:
        raise HTTPException(404, "空间不存在")
    st = db.query(Station).filter(Station.id == s.station_id).first() if s.station_id else None
    return ok({
        "id": s.id, "name": s.name, "type": s.type, "capacity": s.capacity,
        "address": s.address, "cover_url": s.cover_url,
        "description": s.description,
        "price_per_hour": s.price_per_hour, "facilities": s.facilities,
        "available_hours": s.available_hours, "rating": s.rating,
        "station": {"id": st.id, "name": st.name, "region": st.region} if st else None,
    })


@router.post("/book")
def create_booking(payload: BookingCreate,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Space).filter(Space.id == payload.space_id).first()
    if not s:
        raise HTTPException(404, "空间不存在")
    end = payload.start_time + timedelta(hours=payload.hours)
    conflict = db.query(Booking).filter(
        Booking.space_id == payload.space_id,
        Booking.status != 'cancelled',
        Booking.start_time < end,
        Booking.end_time > payload.start_time,
    ).first()
    if conflict:
        raise HTTPException(400, "该时间段已被预约，请选择其他时段")
    free_trial_used = db.query(Booking).filter(
        Booking.user_id == user.id, Booking.is_free_trial == True
    ).count() > 0
    is_free = not free_trial_used and not user.is_paid
    amount = 0 if is_free else int(s.price_per_hour * payload.hours)
    b = Booking(space_id=s.id, user_id=user.id, activity_id=payload.activity_id,
                start_time=payload.start_time, end_time=end, hours=payload.hours,
                amount=amount, status="paid" if is_free else "pending",
                is_free_trial=is_free)
    db.add(b)
    db.commit()
    db.refresh(b)
    return ok({"id": b.id, "amount": amount, "is_free_trial": is_free, "status": b.status})


@router.get("/bookings/my")
def my_bookings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bks = db.query(Booking).filter(Booking.user_id == user.id).order_by(Booking.start_time.desc()).all()
    return ok({"items": [{
        "id": b.id, "space_id": b.space_id, "start": b.start_time, "end": b.end_time,
        "hours": b.hours, "amount": b.amount, "status": b.status, "free": b.is_free_trial,
    } for b in bks]})


@router.get("/stations/")
def list_stations(db: Session = Depends(get_db)):
    items = []
    for s in db.query(Station).all():
        op = db.query(User).filter(User.id == s.operator_id).first() if s.operator_id else None
        items.append({
            "id": s.id, "name": s.name, "level": s.level, "region": s.region,
            "address": s.address, "cover_url": s.cover_url,
            "operator_name": op.name if op else "",
            "member_count": s.member_count, "shareholder_count": s.shareholder_count,
            "annual_revenue": s.annual_revenue,
        })
    return ok({"items": items, "total": len(items)})


@router.get("/stations/{station_id}")
def station_detail(station_id: int, db: Session = Depends(get_db)):
    s = db.query(Station).filter(Station.id == station_id).first()
    if not s:
        raise HTTPException(404, "空间站不存在")
    shareholders = db.query(StationShareholder).filter(
        StationShareholder.station_id == station_id, StationShareholder.is_active == True
    ).all()
    sh_list = []
    for sh in shareholders:
        u = db.query(User).filter(User.id == sh.user_id).first()
        sh_list.append({
            "user_id": sh.user_id, "name": u.name if u else "",
            "industry": sh.industry, "shares": sh.shares,
            "invest_amount": sh.invest_amount, "rights_mask": sh.rights_mask,
        })
    spaces = db.query(Space).filter(Space.station_id == station_id).all()
    return ok({
        "id": s.id, "name": s.name, "level": s.level, "region": s.region,
        "address": s.address, "cover_url": s.cover_url, "description": s.description,
        "member_count": s.member_count, "shareholder_count": s.shareholder_count,
        "annual_revenue": s.annual_revenue,
        "shareholders": sh_list,
        "spaces": [{"id": sp.id, "name": sp.name, "type": sp.type,
                    "capacity": sp.capacity, "price_per_hour": sp.price_per_hour} for sp in spaces],
    })
