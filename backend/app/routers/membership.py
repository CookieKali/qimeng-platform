"""合伙人会员订单"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.membership import MembershipOrder
from ..models.experience import ExperienceQuota
from ..core.response import ok
from ..config import settings
from ..core.membership_fulfillment import fulfill_membership_order
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/membership", tags=["membership"])

_TIER_AMOUNTS = {
    "basic": 1_000_000,
    "pro": 3_000_000,
    "flagship": 10_000_000,
}
_VALID_TIERS = frozenset(_TIER_AMOUNTS)


class CreateOrderIn(BaseModel):
    tier: str


def _order_item(o: MembershipOrder) -> dict:
    return {
        "id": o.id,
        "user_id": o.user_id,
        "tier": o.tier,
        "amount": o.amount,
        "status": o.status,
        "referrer_id": o.referrer_id,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "paid_at": o.paid_at.isoformat() if o.paid_at else None,
        "note": o.note,
    }


@router.post("/orders")
def create_order(payload: CreateOrderIn,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    tier = payload.tier.strip().lower()
    if tier not in _VALID_TIERS:
        raise HTTPException(400, "tier 须为 basic / pro / flagship 之一")
    order = MembershipOrder(
        user_id=user.id,
        tier=tier,
        amount=_TIER_AMOUNTS[tier],
        status="pending",
        referrer_id=user.inviter_id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return ok(_order_item(order), msg="订单已创建")


@router.get("/orders/my")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(MembershipOrder)
        .filter(MembershipOrder.user_id == user.id)
        .order_by(MembershipOrder.created_at.desc())
        .all()
    )
    items = [_order_item(o) for o in rows]
    return ok({"items": items, "total": len(items)})


@router.get("/quota/my")
def my_quota(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前用户体验消费额度（分）"""
    quota = db.query(ExperienceQuota).filter(ExperienceQuota.user_id == user.id).first()
    if not quota:
        return ok({"total": 0, "used": 0, "remaining": 0})
    total = quota.total or 0
    used = quota.used or 0
    return ok({"total": total, "used": used, "remaining": total - used})


@router.post("/orders/{order_id}/mock-pay")
def mock_pay(order_id: int,
             user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    if not settings.allow_mock_pay:
        raise HTTPException(403, "生产环境已关闭模拟支付，请使用微信支付")
    order = db.query(MembershipOrder).filter(MembershipOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.user_id != user.id:
        raise HTTPException(403, "无权操作该订单")
    if order.status == "paid":
        raise HTTPException(400, "订单已支付")
    fulfill_membership_order(db, order, user)
    db.commit()
    db.refresh(order)
    return ok(_order_item(order), msg="支付成功（模拟）")
