"""管控后台 - 演示用最小集（用户/积分/仲裁/分润）"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models.user import User
from ..models.task import TaskAppeal
from ..models.profit import ProfitSharingRecord, StationProfitSettlement
from ..models.space import StationShareholder, Booking, Space, Station
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: User):
    if user.role != "super_admin":
        raise HTTPException(403, "需要超级管理员权限")


class BookingAuditUpdate(BaseModel):
    audit_status: str  # "approved" or "rejected"
    reject_reason: Optional[str] = ""


@router.get("/users")
def users(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    items = []
    for u in db.query(User).limit(200).all():
        items.append({"id": u.id, "name": u.name, "phone": u.phone,
                      "role": u.role, "is_paid": u.is_paid,
                      "level": u.reputation_level, "credit": u.credit_balance})
    return ok({"items": items, "total": len(items)})


@router.get("/appeals/pending")
def pending_appeals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    items = db.query(TaskAppeal).filter(TaskAppeal.status == "pending").all()
    return ok({"items": [{"id": a.id, "task_id": a.task_id, "reason": a.reason,
                          "appellant_id": a.appellant_id, "at": a.created_at} for a in items]})


@router.post("/appeals/{appeal_id}/resolve")
def resolve_appeal(appeal_id: int, verdict: str = "驳回",
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    a = db.query(TaskAppeal).filter(TaskAppeal.id == appeal_id).first()
    if not a:
        raise HTTPException(404, "申诉不存在")
    a.status = "resolved"
    a.verdict = verdict
    a.arbitrator_id = user.id
    db.commit()
    return ok(msg="已仲裁")


@router.post("/profit/settle")
def settle(period: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """月度结算：聚合会费分润 → 平台池 4% 股东分红 → 标记当月 pending 已发放"""
    _require_admin(user)

    platform_user = db.query(User).order_by(User.id).first()
    if not platform_user:
        raise HTTPException(500, "平台账户不存在")

    member_fee_rows = db.query(ProfitSharingRecord).filter(
        ProfitSharingRecord.income_source == "member_fee",
        ProfitSharingRecord.period == period,
    ).all()

    # A. total_revenue = 当月 member_fee 分润 amount 之和（分）
    total_revenue = int(sum(r.amount or 0 for r in member_fee_rows))

    # B. platform_pool = 当月平台账户 member_fee 分润之和（分）
    platform_pool = int(sum(
        r.amount or 0 for r in member_fee_rows if r.user_id == platform_user.id
    ))

    # C. dividend_pool = platform_pool * 4 // 100（分）
    dividend_pool = platform_pool * 4 // 100

    # 清除该月旧的空间站分红流水（含种子演示数据），避免与本次结算累加不一致
    db.query(ProfitSharingRecord).filter(
        ProfitSharingRecord.period == period,
        ProfitSharingRecord.income_source == "station_dividend",
    ).delete(synchronize_session=False)

    # D. station_id=1 活跃股东按 shares 占比分配 dividend_pool
    shareholders = db.query(StationShareholder).filter(
        StationShareholder.station_id == 1,
        StationShareholder.is_active == True,
    ).all()
    shareholder_count = len(shareholders)
    dividend_distributed = 0

    if shareholders and dividend_pool > 0:
        total_shares = sum(max(0, int(float(sh.shares or 0))) for sh in shareholders)
        if total_shares > 0:
            allocations = []
            for sh in shareholders:
                sh_shares = max(0, int(float(sh.shares or 0)))
                # share_amount = dividend_pool * shares // total_shares
                share_amount = dividend_pool * sh_shares // total_shares
                allocations.append((sh, share_amount))
            distributed_sum = sum(amt for _, amt in allocations)
            tail = dividend_pool - distributed_sum
            if tail and allocations:
                allocations[0] = (allocations[0][0], allocations[0][1] + tail)
            for sh, share_amount in allocations:
                dividend_distributed += share_amount
                db.add(ProfitSharingRecord(
                    user_id=sh.user_id,
                    period=period,
                    income_source="station_dividend",
                    source_amount=float(platform_pool),
                    percentage=4.0,
                    amount=float(share_amount),
                    status="pending",
                    note="北外滩空间站月度分红",
                ))

    # E. 空间站月度结算记录（同 period 更新，不重复插入）
    settlement = db.query(StationProfitSettlement).filter(
        StationProfitSettlement.station_id == 1,
        StationProfitSettlement.period == period,
    ).first()
    if settlement:
        settlement.total_revenue = float(total_revenue)
        settlement.cost = 0
        settlement.net_profit = float(platform_pool)
        settlement.shareholder_dividend_rate = 4.0
        settlement.distributed_amount = float(dividend_pool)
    else:
        db.add(StationProfitSettlement(
            station_id=1,
            period=period,
            total_revenue=float(total_revenue),
            cost=0,
            net_profit=float(platform_pool),
            shareholder_dividend_rate=4.0,
            distributed_amount=float(dividend_pool),
        ))

    # D/E 新建记录先 flush，否则 F 查询 pending 读不到 session 内未落库的分红流水
    db.flush()

    # F. 当月全部 pending（含 D 步新建分红）标为 paid
    pending_items = db.query(ProfitSharingRecord).filter(
        ProfitSharingRecord.period == period,
        ProfitSharingRecord.status == "pending",
    ).all()
    now = datetime.utcnow()
    for r in pending_items:
        r.status = "paid"
        r.paid_at = now
        r.tx_hash = f"0x{r.id:064x}"

    db.commit()
    return ok({
        "period": period,
        "total_revenue": total_revenue,
        "platform_pool": platform_pool,
        "dividend_pool": dividend_pool,
        "dividend_distributed": dividend_distributed,
        "shareholder_count": shareholder_count,
        "settled_count": len(pending_items),
    }, msg=f"{period} 已结算")


# 预约管理接口
@router.get("/bookings")
def admin_list_bookings(
    status: Optional[str] = None,
    audit_status: Optional[str] = None,
    user_id: Optional[int] = None,
    space_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """管理员获取所有预约列表"""
    _require_admin(user)
    
    query = db.query(Booking)
    
    if status:
        query = query.filter(Booking.status == status)
    if audit_status:
        query = query.filter(Booking.audit_status == audit_status)
    if user_id:
        query = query.filter(Booking.user_id == user_id)
    if space_id:
        query = query.filter(Booking.space_id == space_id)
    
    total = query.count()
    bookings = query.order_by(Booking.created_at.desc()).limit(limit).offset(offset).all()
    
    items = []
    for b in bookings:
        space = db.query(Space).filter(Space.id == b.space_id).first()
        booking_user = db.query(User).filter(User.id == b.user_id).first()
        station = db.query(Station).filter(Station.id == space.station_id).first() if space and space.station_id else None
        approver = db.query(User).filter(User.id == b.approved_by).first() if b.approved_by else None
        
        items.append({
            "id": b.id,
            "space_id": b.space_id,
            "space_name": space.name if space else "",
            "space_address": space.address if space else "",
            "space_type": space.type if space else "",
            "station_name": station.name if station else "",
            "user_id": b.user_id,
            "user_name": booking_user.name if booking_user else "",
            "user_phone": booking_user.phone if booking_user else "",
            "start_time": b.start_time,
            "end_time": b.end_time,
            "hours": b.hours,
            "amount": b.amount,
            "status": b.status,
            "audit_status": b.audit_status,
            "purpose": b.purpose,
            "participant_count": b.participant_count,
            "note": b.note,
            "is_free_trial": b.is_free_trial,
            "approved_by": b.approved_by,
            "approver_name": approver.name if approver else "",
            "approved_at": b.approved_at,
            "reject_reason": b.reject_reason,
            "created_at": b.created_at,
            "updated_at": b.updated_at,
        })
    
    return ok({"items": items, "total": total})


@router.get("/bookings/{booking_id}")
def admin_booking_detail(
    booking_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """管理员获取单个预约详情"""
    _require_admin(user)
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "预约不存在")
    
    space = db.query(Space).filter(Space.id == b.space_id).first()
    booking_user = db.query(User).filter(User.id == b.user_id).first()
    station = db.query(Station).filter(Station.id == space.station_id).first() if space and space.station_id else None
    approver = db.query(User).filter(User.id == b.approved_by).first() if b.approved_by else None
    
    return ok({
        "id": b.id,
        "space_id": b.space_id,
        "space_name": space.name if space else "",
        "space_address": space.address if space else "",
        "space_type": space.type if space else "",
        "space_capacity": space.capacity if space else None,
        "space_facilities": space.facilities if space else None,
        "station_name": station.name if station else "",
        "station_region": station.region if station else "",
        "user_id": b.user_id,
        "user_name": booking_user.name if booking_user else "",
        "user_phone": booking_user.phone if booking_user else "",
        "user_avatar": booking_user.avatar_url if booking_user else "",
        "start_time": b.start_time,
        "end_time": b.end_time,
        "hours": b.hours,
        "amount": b.amount,
        "status": b.status,
        "audit_status": b.audit_status,
        "purpose": b.purpose,
        "participant_count": b.participant_count,
        "note": b.note,
        "is_free_trial": b.is_free_trial,
        "approved_by": b.approved_by,
        "approver_name": approver.name if approver else "",
        "approved_at": b.approved_at,
        "reject_reason": b.reject_reason,
        "created_at": b.created_at,
        "updated_at": b.updated_at,
    })


@router.post("/bookings/{booking_id}/audit")
def admin_audit_booking(
    booking_id: int,
    payload: BookingAuditUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """管理员审核预约"""
    _require_admin(user)
    b = db.query(Booking).filter(Booking.id == booking_id).first()
    if not b:
        raise HTTPException(404, "预约不存在")
    
    if payload.audit_status not in ["approved", "rejected"]:
        raise HTTPException(400, "审核状态必须是 approved 或 rejected")
    
    b.audit_status = payload.audit_status
    b.approved_by = user.id
    b.approved_at = datetime.utcnow()
    b.reject_reason = payload.reject_reason if payload.audit_status == "rejected" else ""
    b.updated_at = datetime.utcnow()
    
    # 如果审核通过且状态是pending，自动设为paid
    if payload.audit_status == "approved" and b.status == "pending":
        b.status = "paid"
    
    db.commit()
    return ok(msg="审核完成")
