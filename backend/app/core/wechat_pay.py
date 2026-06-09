"""微信支付 APIv3 — JSAPI 预下单与回调验签（配置齐全后实现具体 HTTP 调用）"""
from __future__ import annotations

import logging
from typing import Any, Optional

from ..config import settings
from .wechat import build_out_trade_no, wechat_pay_configured

logger = logging.getLogger(__name__)


class WechatPayNotConfigured(Exception):
    pass


class WechatPayNotImplemented(Exception):
    """证书与密钥已配置，但统一下单 HTTP 尚未接入（见 docs/上线与微信支付指南.md）"""


def create_jsapi_prepay(
    *,
    description: str,
    amount_fen: int,
    openid: str,
    out_trade_no: str,
) -> dict[str, Any]:
    """
    调用微信 V3 JSAPI 下单，返回小程序 wx.requestPayment 所需字段。

    接入步骤：
    1. pip install wechatpayv3 或自签 requests 调 /v3/pay/transactions/jsapi
    2. 使用 WECHAT_MCH_PRIVATE_KEY_PATH 签名
    3. 返回 timeStamp, nonceStr, package, signType, paySign
    """
    if not wechat_pay_configured():
        raise WechatPayNotConfigured("微信支付未配置，请设置 WECHAT_* 环境变量")
    raise WechatPayNotImplemented(
        "预下单接口骨架已就绪；请按 docs/上线与微信支付指南.md 接入微信 V3 API"
    )


def verify_notify_signature(headers: dict, body: bytes) -> bool:
    """验证微信支付回调签名；未配置时返回 False"""
    if not wechat_pay_configured():
        return False
    # TODO: 使用平台证书验签 Wechatpay-Signature
    logger.warning("verify_notify_signature: 尚未实现，拒绝未验签回调")
    return False


def parse_notify_resource(body: dict) -> Optional[dict]:
    """
    解析解密后的回调 resource（交易成功时含 out_trade_no、transaction_id）。
    当前为占位，接入后解密 AES-GCM。
    """
    return None
