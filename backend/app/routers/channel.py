"""渠道工作台 - 引荐链接与推荐人统计（只读）"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.user import User
from ..models.profit import ChannelRelation, ProfitSharingRecord
from ..models.contribution import ContributionPoint
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/channel", tags=["channel"])


@router.get("/my-link")
def my_link(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前用户引荐码与演示链接"""
    if not user.invite_code:
        user.invite_code = f"QM-{uuid.uuid4().hex[:8].upper()}"
        db.commit()
        db.refresh(user)
    code = user.invite_code or ""
    mini_path = f"/pages/login/login?ref={code}" if code else ""
    return ok({
        "invite_code": code,
        "link": f"https://qimeng.demo/r/{code}" if code else "",
        "miniprogram_path": mini_path,
    })


@router.get("/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """作为推荐人的渠道统计（金额单位：分）"""
    referee_count = (
        db.query(ChannelRelation)
        .filter(ChannelRelation.referrer_id == user.id)
        .count()
    )

    register_contrib = (
        db.query(func.coalesce(func.sum(ContributionPoint.amount), 0))
        .filter(
            ContributionPoint.user_id == user.id,
            ContributionPoint.source_type == "invite_register",
        )
        .scalar()
    ) or 0

    paid_contrib = (
        db.query(func.coalesce(func.sum(ContributionPoint.amount), 0))
        .filter(
            ContributionPoint.user_id == user.id,
            ContributionPoint.source_type == "invite_paid",
        )
        .scalar()
    ) or 0

    member_fee_profit = (
        db.query(func.coalesce(func.sum(ProfitSharingRecord.amount), 0))
        .filter(
            ProfitSharingRecord.user_id == user.id,
            ProfitSharingRecord.income_source == "member_fee",
        )
        .scalar()
    ) or 0

    return ok({
        "referee_count": referee_count,
        "register_contrib": int(register_contrib),
        "paid_contrib": int(paid_contrib),
        "member_fee_profit": int(member_fee_profit),
    })
