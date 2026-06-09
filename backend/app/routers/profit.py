"""V2.1 分润体系 - 看板/引荐追踪/结算记录/股东分红"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from ..database import get_db
from ..models.user import User
from ..models.profit import ChannelRelation, ProfitSharingRecord, StationProfitSettlement
from ..models.space import Station, StationShareholder
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/profit", tags=["profit"])


@router.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """分润看板：今日/本周/本月分润概览"""
    now = datetime.utcnow()
    today_key = now.strftime("%Y-%m-%d")
    month_key = now.strftime("%Y-%m")

    q = db.query(ProfitSharingRecord).filter(ProfitSharingRecord.user_id == user.id)
    total = sum(r.amount or 0 for r in q.all())
    month_total = sum(r.amount or 0 for r in q.filter(ProfitSharingRecord.period == month_key).all())
    pending = sum(r.amount or 0 for r in q.filter(ProfitSharingRecord.status == "pending").all())
    paid = sum(r.amount or 0 for r in q.filter(ProfitSharingRecord.status == "paid").all())

    refers = db.query(ChannelRelation).filter(ChannelRelation.referrer_id == user.id).count()

    return ok({
        "total": total, "month_total": month_total,
        "pending": pending, "paid": paid,
        "referee_count": refers,
        "period": month_key,
    })


@router.get("/records")
def records(status: str = "全部", source: str = "全部",
            page: int = 1, page_size: int = 30,
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(ProfitSharingRecord).filter(ProfitSharingRecord.user_id == user.id)
    if status != "全部":
        q = q.filter(ProfitSharingRecord.status == status)
    if source != "全部":
        q = q.filter(ProfitSharingRecord.income_source == source)
    total = q.count()
    items = q.order_by(ProfitSharingRecord.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({"total": total, "items": [{
        "id": r.id, "period": r.period, "source": r.income_source,
        "source_amount": r.source_amount, "percentage": r.percentage,
        "amount": r.amount, "status": r.status, "note": r.note,
        "tx_hash": r.tx_hash, "created_at": r.created_at, "paid_at": r.paid_at,
    } for r in items]})


@router.get("/referrals")
def referral_tree(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """引荐裂变图谱"""
    directs = db.query(ChannelRelation).filter(ChannelRelation.referrer_id == user.id).all()
    items = []
    for d in directs:
        target = db.query(User).filter(User.id == d.referee_id).first()
        if not target:
            continue
        sub = db.query(ChannelRelation).filter(ChannelRelation.referrer_id == target.id).count()
        items.append({
            "user_id": target.id, "name": target.name,
            "role": target.role, "is_paid": target.is_paid,
            "relation": d.relation_type, "second_level_count": sub,
            "since": d.created_at,
        })
    return ok({"direct_count": len(items), "items": items})


@router.get("/stations/{station_id}/settlements")
def station_settlements(station_id: int, db: Session = Depends(get_db)):
    """空间站月度结算记录"""
    items = db.query(StationProfitSettlement).filter(
        StationProfitSettlement.station_id == station_id
    ).order_by(StationProfitSettlement.period.desc()).all()
    return ok({"items": [{
        "period": s.period, "revenue": s.total_revenue, "cost": s.cost,
        "net": s.net_profit, "dividend_rate": s.shareholder_dividend_rate,
        "distributed": s.distributed_amount, "breakdown": s.breakdown,
    } for s in items]})


@router.get("/shareholders/me")
def my_shareholdings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我的联席股东权益"""
    items = []
    for sh in db.query(StationShareholder).filter(
        StationShareholder.user_id == user.id, StationShareholder.is_active == True
    ).all():
        st = db.query(Station).filter(Station.id == sh.station_id).first()
        items.append({
            "station_id": sh.station_id, "station_name": st.name if st else "",
            "shares": sh.shares, "invest_amount": sh.invest_amount,
            "industry": sh.industry, "rights_mask": sh.rights_mask,
            "subscribe_date": sh.subscribe_date,
        })
    return ok({"items": items, "total": len(items)})


@router.post("/records/{record_id}/confirm")
def confirm_profit_record(
    record_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """链接者确认待发放分润（演示对账步骤）"""
    r = db.query(ProfitSharingRecord).filter(
        ProfitSharingRecord.id == record_id,
        ProfitSharingRecord.user_id == user.id,
    ).first()
    if not r:
        raise HTTPException(404, "分润记录不存在")
    if r.status != "pending":
        raise HTTPException(400, f"当前状态为 {r.status}，仅 pending 可确认")
    r.status = "confirmed"
    db.commit()
    return ok(
        {"id": r.id, "status": r.status, "amount": r.amount},
        msg="已确认，等待发放",
    )
