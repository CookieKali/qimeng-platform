"""合伙人会费订单支付成功后的统一履约（mock 与微信回调共用）"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.membership import MembershipOrder
from ..models.experience import ExperienceQuota
from ..models.profit import ProfitSharingRecord
from ..models.space import Station
from .contribution import add_contribution


def settle_membership_profit(db: Session, order: MembershipOrder) -> None:
    """会费入账后分润记账（同一事务内调用）"""
    amount = order.amount
    period = datetime.utcnow().strftime("%Y-%m")

    share_ref = amount * 200 // 1000
    share_exp = amount * 360 // 1000
    share_mgr = amount * 198 // 1000
    share_svc = amount * 44 // 1000
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

    quota = db.query(ExperienceQuota).filter(ExperienceQuota.user_id == order.user_id).first()
    if not quota:
        quota = ExperienceQuota(user_id=order.user_id, total=0, used=0)
        db.add(quota)
    quota.total += share_exp

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

    if referrer:
        add_contribution(
            db, referrer, "invite_paid", 200,
            related_entity=f"order_{order.id}",
            note="推荐付费升级",
        )


def fulfill_membership_order(db: Session, order: MembershipOrder, payer: User) -> None:
    """将待支付会费订单标记为已支付并触发分润/贡献（幂等：已支付则跳过）"""
    if order.status == "paid":
        return
    if order.status != "pending":
        raise HTTPException(400, "订单状态不可支付")
    now = datetime.utcnow()
    order.status = "paid"
    order.paid_at = now
    payer.is_paid = True
    if payer.role == "normal":
        payer.role = "paid"
    payer.paid_at = now
    settle_membership_profit(db, order)
