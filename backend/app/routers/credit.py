"""模块5：积分与交易（任务交易积分 + 生态贡献积分）"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models.user import User
from ..models.credit import CreditTransaction
from ..models.contribution import ContributionPoint
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/credit", tags=["credit"])


class RechargeIn(BaseModel):
    amount: int


class TransferIn(BaseModel):
    to_user_id: int
    amount: int
    scene: str = "服务购买"


@router.get("/balance")
def balance(user: User = Depends(get_current_user)):
    return ok({
        "credit_balance": user.credit_balance,
        "contribution_balance": user.contribution_balance,
        "reputation_level": user.reputation_level,
        "fee_rate": _fee_rate_for_level(user.reputation_level),
    })


def _fee_rate_for_level(lv: str) -> int:
    return {"SSS": 20, "SS": 35, "S": 40, "A": 50, "B": 50, "C": 60, "D": 60}.get(lv, 50)  # 千分位


@router.post("/recharge")
def recharge(payload: RechargeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.amount <= 0:
        raise HTTPException(400, "金额必须>0")
    before = user.credit_balance
    user.credit_balance += payload.amount
    db.add(CreditTransaction(user_id=user.id, type="recharge", amount=payload.amount,
                             balance_before=before, balance_after=user.credit_balance,
                             note="官方充值"))
    db.commit()
    return ok({"balance": user.credit_balance}, msg="充值成功")


@router.post("/transfer")
def transfer(payload: TransferIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.amount <= 0 or user.credit_balance < payload.amount:
        raise HTTPException(400, "积分不足")
    to = db.query(User).filter(User.id == payload.to_user_id).first()
    if not to:
        raise HTTPException(404, "目标用户不存在")
    fee_rate = _fee_rate_for_level(user.reputation_level)
    fee = payload.amount * fee_rate // 1000
    net = payload.amount - fee
    user.credit_balance -= payload.amount
    to.credit_balance += net
    db.add(CreditTransaction(user_id=user.id, type="transfer_out", amount=-payload.amount,
                             balance_before=user.credit_balance + payload.amount,
                             balance_after=user.credit_balance,
                             related_user_id=to.id, fee=fee, fee_rate=fee_rate,
                             note=f"转给{to.name}·{payload.scene}"))
    db.add(CreditTransaction(user_id=to.id, type="transfer_in", amount=net,
                             balance_before=to.credit_balance - net,
                             balance_after=to.credit_balance,
                             related_user_id=user.id, note=f"来自{user.name}"))
    db.commit()
    return ok({"net": net, "fee": fee, "fee_rate": fee_rate / 10}, msg="转让成功")


@router.get("/transactions")
def transactions(page: int = 1, page_size: int = 30,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(CreditTransaction).filter(CreditTransaction.user_id == user.id)
    total = q.count()
    items = q.order_by(CreditTransaction.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({"total": total, "items": [{
        "id": t.id, "type": t.type, "amount": t.amount,
        "balance_after": t.balance_after, "fee": t.fee,
        "note": t.note, "created_at": t.created_at,
    } for t in items]})


@router.get("/contribution")
def contribution_list(page: int = 1, page_size: int = 30,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """生态贡献积分流水"""
    q = db.query(ContributionPoint).filter(ContributionPoint.user_id == user.id)
    total = q.count()
    items = q.order_by(ContributionPoint.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({
        "balance": user.contribution_balance,
        "total": total,
        "items": [{"id": p.id, "source": p.source_type, "amount": p.amount,
                   "balance": p.balance, "note": p.note, "created_at": p.created_at} for p in items],
    })
