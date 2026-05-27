"""合伙人会员订单"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.membership import MembershipOrder
from ..models.experience import ExperienceQuota
from ..models.profit import ProfitSharingRecord
from ..models.space import Station
from ..core.response import ok
from ..core.contribution import add_contribution
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


def _settle_membership(db: Session, order: MembershipOrder) -> None:
    """会费 mock-pay 后一次性分账（同一事务，仅 pending→paid 时调用）"""
    amount = order.amount
    period = datetime.utcnow().strftime("%Y-%m")

    # 5 路千分位：share = amount * permille // 1000
    share_ref = amount * 200 // 1000   # 推荐人 200‰
    share_exp = amount * 360 // 1000   # 体验额度 360‰
    share_mgr = amount * 198 // 1000   # 店长 198‰
    share_svc = amount * 44 // 1000    # 服务 44‰
    # 平台实得 = 尾差（amount 减去前 4 路之和），保证五路合计 == amount
    share_tail = amount - share_ref - share_exp - share_mgr - share_svc

    platform_user = db.query(User).order_by(User.id).first()
    if not platform_user:
        raise HTTPException(500, "平台账户不存在")

    referrer = None
    if order.referrer_id:
        referrer = db.query(User).filter(User.id == order.referrer_id).first()

    manager_user = None
    station = db.query(Station).filter(Station.id == 1).first()
    if station and station.operator_id:
        manager_user = db.query(User).filter(User.id == station.operator_id).first()

    # 体验额度入账（买家）
    quota = db.query(ExperienceQuota).filter(ExperienceQuota.user_id == order.user_id).first()
    if not quota:
        quota = ExperienceQuota(user_id=order.user_id, total=0, used=0)
        db.add(quota)
    quota.total += share_exp

    # 推荐人现金 200‰
    if referrer:
        db.add(ProfitSharingRecord(
            user_id=referrer.id,
            period=period,
            income_source="member_fee",
            source_amount=float(amount),
            percentage=20.0,
            amount=float(share_ref),
            status="pending",
            note="会费分账·推荐人",
        ))

    # 店长现金 198‰
    if manager_user:
        db.add(ProfitSharingRecord(
            user_id=manager_user.id,
            period=period,
            income_source="member_fee",
            source_amount=float(amount),
            percentage=19.8,
            amount=float(share_mgr),
            status="pending",
            note="会费分账·空间站老板",
        ))

    # 服务 44‰ → 平台账户
    db.add(ProfitSharingRecord(
        user_id=platform_user.id,
        period=period,
        income_source="member_fee",
        source_amount=float(amount),
        percentage=4.4,
        amount=float(share_svc),
        status="pending",
        note="会费分账·门店服务",
    ))

    # 平台：尾差 + 无推荐人时并入 200‰ + 无店长时并入 198‰
    platform_amt = share_tail
    if not referrer:
        platform_amt += share_ref
    if not manager_user:
        platform_amt += share_mgr

    db.add(ProfitSharingRecord(
        user_id=platform_user.id,
        period=period,
        income_source="member_fee",
        source_amount=float(amount),
        percentage=19.8,
        amount=float(platform_amt),
        status="pending",
        note="会费分账·平台运营",
    ))

    # 推荐人贡献积分（invite_paid 基础 200，含等级加成与信用联动）
    if referrer:
        add_contribution(
            db, referrer, "invite_paid", 200,
            related_entity=f"order_{order.id}",
            note="推荐付费升级",
        )


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
    order = db.query(MembershipOrder).filter(MembershipOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.user_id != user.id:
        raise HTTPException(403, "无权操作该订单")
    if order.status != "pending":
        raise HTTPException(400, "仅待支付订单可支付")
    now = datetime.utcnow()
    order.status = "paid"
    order.paid_at = now
    user.is_paid = True
    if user.role == "normal":
        user.role = "paid"
    user.paid_at = now
    _settle_membership(db, order)
    db.commit()
    db.refresh(order)
    return ok(_order_item(order), msg="支付成功（模拟）")
