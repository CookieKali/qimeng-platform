"""分润入账：为被引荐人的关键行为给其推荐人写入 pending 流水"""
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.profit import ChannelRelation, ProfitSharingRecord
from ..models.user import User

TASK_REFERRAL_PCT = 5.0
ACTIVITY_REFERRAL_PCT = 15.0
# 活动报名演示成交额（分）
ACTIVITY_REFERRAL_BASE_FEN = 10000


def linker_badge(user: User) -> str:
    """链接者标识（通讯录/名片展示）"""
    role = (user.role or "").strip()
    if role == "partner":
        return "合伙人"
    if role == "kol":
        return "渠道"
    if role == "station_admin":
        return "场域"
    if role == "investor":
        return "资源"
    if role == "mentor":
        return "专家"
    if user.is_paid:
        return "VIP"
    return ""


def _resolve_referrer_id(db: Session, referee: User) -> int | None:
    if referee.inviter_id:
        return referee.inviter_id
    rel = (
        db.query(ChannelRelation)
        .filter(
            ChannelRelation.referee_id == referee.id,
            ChannelRelation.relation_type.in_(("recommend", "refer")),
        )
        .order_by(ChannelRelation.id.desc())
        .first()
    )
    return rel.referrer_id if rel else None


def grant_referrer_profit(
    db: Session,
    referee: User,
    income_source: str,
    source_amount: float,
    percentage: float,
    note: str,
    idempotency_key: str = "",
) -> float:
    """
    给 referee 的推荐人记一笔 pending 分润。idempotency_key 非空时幂等。
    不在此函数内 commit。返回实得金额（0 表示未入账）。
    """
    referrer_id = _resolve_referrer_id(db, referee)
    if not referrer_id:
        return 0.0

    key = (idempotency_key or "").strip()
    if key:
        exists = (
            db.query(ProfitSharingRecord.id)
            .filter(
                ProfitSharingRecord.user_id == referrer_id,
                ProfitSharingRecord.income_source == income_source,
                ProfitSharingRecord.note.contains(key),
            )
            .first()
        )
        if exists:
            return 0.0

    amount = round(float(source_amount) * float(percentage) / 100.0, 2)
    if amount <= 0:
        return 0.0

    period = datetime.utcnow().strftime("%Y-%m")
    full_note = note if not key else f"{note} [{key}]"
    db.add(
        ProfitSharingRecord(
            user_id=referrer_id,
            period=period,
            income_source=income_source,
            source_amount=float(source_amount),
            percentage=float(percentage),
            amount=amount,
            status="pending",
            note=full_note,
        )
    )
    return amount


def grant_task_referral_profit(db: Session, referee: User, task_id: int, gross_fen: int) -> float:
    """任务验收通过后，推荐人获得成交额 5% 分润（演示）"""
    if gross_fen <= 0:
        return 0.0
    return grant_referrer_profit(
        db,
        referee,
        "task_referral",
        float(gross_fen),
        TASK_REFERRAL_PCT,
        "任务成交引荐分润",
        idempotency_key=f"task_{task_id}",
    )


def grant_activity_referral_profit(db: Session, referee: User, activity_id: int) -> float:
    """活动报名后，推荐人获得演示成交额 15% 分润"""
    return grant_referrer_profit(
        db,
        referee,
        "activity",
        float(ACTIVITY_REFERRAL_BASE_FEN),
        ACTIVITY_REFERRAL_PCT,
        "活动报名引荐分润",
        idempotency_key=f"activity_{activity_id}",
    )
