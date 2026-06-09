"""微信支付：预下单与回调"""
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models.user import User
from ..models.membership import MembershipOrder
from ..models.payment import PaymentRecord
from ..core.response import ok
from ..core.membership_fulfillment import fulfill_membership_order
from ..core.wechat import build_out_trade_no, wechat_pay_configured
from ..core.wechat_pay import (
    WechatPayNotConfigured,
    WechatPayNotImplemented,
    create_jsapi_prepay,
    verify_notify_signature,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/payment", tags=["payment"])

_TIER_LABELS = {"basic": "合伙人·基础", "pro": "合伙人·专业", "flagship": "合伙人·旗舰"}


@router.post("/membership/{order_id}/prepay")
def prepay_membership(
    order_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建微信 JSAPI 预支付；开发 mock 模式返回 mode=mock 供小程序走 mock-pay"""
    order = db.query(MembershipOrder).filter(MembershipOrder.id == order_id).first()
    if not order:
        raise HTTPException(404, "订单不存在")
    if order.user_id != user.id:
        raise HTTPException(403, "无权操作该订单")
    if order.status != "pending":
        raise HTTPException(400, "仅待支付订单可预下单")

    if not settings.use_wechat_pay:
        if settings.allow_mock_pay:
            return ok({
                "mode": "mock",
                "order_id": order.id,
                "amount": order.amount,
                "msg": "演示环境请使用模拟支付",
            })
        raise HTTPException(503, "未开启微信支付且不允许模拟支付")

    if not user.wx_openid:
        raise HTTPException(400, "请先完成微信授权（wx.login 后调用 /api/auth/wx-bind）")

    if not wechat_pay_configured():
        raise HTTPException(503, "微信支付参数未配置完整")

    existing = (
        db.query(PaymentRecord)
        .filter(
            PaymentRecord.order_type == "membership",
            PaymentRecord.order_id == order.id,
            PaymentRecord.status == "pending",
            PaymentRecord.channel == "wechat",
        )
        .order_by(PaymentRecord.id.desc())
        .first()
    )
    out_trade_no = existing.out_trade_no if existing else build_out_trade_no(order.id)
    if not existing:
        db.add(PaymentRecord(
            order_type="membership",
            order_id=order.id,
            user_id=user.id,
            out_trade_no=out_trade_no,
            amount=order.amount,
            channel="wechat",
            status="pending",
        ))
        db.commit()

    desc = _TIER_LABELS.get(order.tier, "企盟合伙人会员")
    try:
        pay_params = create_jsapi_prepay(
            description=desc,
            amount_fen=order.amount,
            openid=user.wx_openid,
            out_trade_no=out_trade_no,
        )
    except WechatPayNotConfigured as e:
        raise HTTPException(503, str(e)) from e
    except WechatPayNotImplemented as e:
        raise HTTPException(501, str(e)) from e

    return ok({"mode": "wechat", "order_id": order.id, "payment": pay_params})


@router.post("/notify/wechat")
async def wechat_pay_notify(request: Request, db: Session = Depends(get_db)):
    """微信支付结果通知（无需登录）；验签通过后履约订单"""
    body_bytes = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}

    if not verify_notify_signature(headers, body_bytes):
        logger.error("wechat notify: signature verification failed or not implemented")
        return {"code": "FAIL", "message": "signature invalid"}

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except json.JSONDecodeError:
        return {"code": "FAIL", "message": "invalid json"}

    # 接入 V3 后在此解密 resource，取出 out_trade_no、transaction_id、trade_state
    out_trade_no = payload.get("out_trade_no") or (
        (payload.get("resource") or {}).get("out_trade_no")
    )
    transaction_id = payload.get("transaction_id") or ""
    trade_state = payload.get("trade_state") or "SUCCESS"

    if not out_trade_no:
        return {"code": "FAIL", "message": "missing out_trade_no"}

    record = db.query(PaymentRecord).filter(PaymentRecord.out_trade_no == out_trade_no).first()
    if not record:
        logger.warning("notify for unknown out_trade_no=%s", out_trade_no)
        return {"code": "FAIL", "message": "order not found"}

    if record.status == "paid":
        return {"code": "SUCCESS", "message": "already paid"}

    if trade_state != "SUCCESS":
        record.status = "failed"
        record.raw_notify = body_bytes.decode("utf-8", errors="replace")[:4000]
        db.commit()
        return {"code": "SUCCESS", "message": "ignored non-success"}

    order = db.query(MembershipOrder).filter(MembershipOrder.id == record.order_id).first()
    payer = db.query(User).filter(User.id == record.user_id).first()
    if not order or not payer:
        return {"code": "FAIL", "message": "membership order missing"}

    fulfill_membership_order(db, order, payer)
    record.status = "paid"
    record.transaction_id = transaction_id
    record.paid_at = datetime.utcnow()
    record.raw_notify = body_bytes.decode("utf-8", errors="replace")[:4000]
    db.commit()
    logger.info("membership order %s paid via wechat %s", order.id, transaction_id)
    return {"code": "SUCCESS", "message": "ok"}
