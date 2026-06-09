"""贡献积分入账与信用联动（§2.4）"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.contribution import ContributionPoint
from ..models.reputation import ReputationRecord


def _multiplier(reputation_level: str) -> float:
    """等级加成：SSS ×1.5，S/SS ×1.2，其余 ×1.0"""
    lv = reputation_level or ""
    if lv == "SSS":
        return 1.5
    if lv in ("S", "SS"):
        return 1.2
    return 1.0


def _cumulative_positive_contribution(db: Session, user_id: int) -> int:
    """
    累计贡献基数：该用户历史 ContributionPoint 中 amount>0 的合计（均为加成后入账额）。
    用于贡献分 // 100 的信用联动判定，不含本次待写入流水。
    """
    total = (
        db.query(func.coalesce(func.sum(ContributionPoint.amount), 0))
        .filter(
            ContributionPoint.user_id == user_id,
            ContributionPoint.amount > 0,
        )
        .scalar()
    )
    return int(total or 0)


def add_contribution(
    db: Session,
    user: User,
    source_type: str,
    base_amount: int,
    related_entity: str = "",
    note: str = "",
) -> int:
    """
    增加贡献积分并处理信用联动。不在此函数内 commit。

    返回本次实际入账额（加成后整数）。
    """
    base_amount = int(base_amount)
    if base_amount <= 0:
        return 0

    amount = int(base_amount * _multiplier(user.reputation_level))

    # 联动判定基数：历史正向流水合计（加成后），不含本条
    before_cumulative = _cumulative_positive_contribution(db, user.id)
    after_cumulative = before_cumulative + amount
    credit_delta = after_cumulative // 100 - before_cumulative // 100

    new_balance = (user.contribution_balance or 0) + amount
    user.contribution_balance = new_balance
    db.add(
        ContributionPoint(
            user_id=user.id,
            source_type=source_type,
            amount=amount,
            balance=new_balance,
            related_entity=related_entity,
            note=note,
        )
    )

    if credit_delta > 0:
        before_rep = user.reputation_executor or 0
        user.reputation_executor = min(1000, before_rep + credit_delta)
        actual_rep_delta = user.reputation_executor - before_rep
        if actual_rep_delta > 0:
            db.add(
                ReputationRecord(
                    user_id=user.id,
                    role_type="executor",
                    dimension="贡献联动",
                    weight=0,
                    delta=actual_rep_delta,
                    detail={
                        "source_type": source_type,
                        "cumulative_before": before_cumulative,
                        "cumulative_after": after_cumulative,
                        "credit_delta": credit_delta,
                    },
                )
            )

    return amount


def grant_contribution_once(
    db: Session,
    user: User,
    source_type: str,
    base_amount: int,
    related_entity: str = "",
    note: str = "",
) -> int:
    """同一 source_type + related_entity 仅入账一次（不在此函数内 commit）"""
    related_entity = (related_entity or "").strip()
    if related_entity:
        exists = (
            db.query(ContributionPoint.id)
            .filter(
                ContributionPoint.user_id == user.id,
                ContributionPoint.source_type == source_type,
                ContributionPoint.related_entity == related_entity,
            )
            .first()
        )
        if exists:
            return 0
    return add_contribution(db, user, source_type, base_amount, related_entity, note)
