"""微信小程序登录与支付配置探测"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_CODE2SESSION = "https://api.weixin.qq.com/sns/jscode2session"


def wechat_login_configured() -> bool:
    return bool(settings.WECHAT_APP_ID and settings.WECHAT_APP_SECRET)


def wechat_pay_configured() -> bool:
    return bool(
        settings.WECHAT_APP_ID
        and settings.WECHAT_MCH_ID
        and settings.WECHAT_API_V3_KEY
        and settings.WECHAT_NOTIFY_URL
        and settings.WECHAT_MCH_PRIVATE_KEY_PATH
    )


async def code_to_openid(js_code: str) -> dict:
    """
    用 wx.login 的 code 换取 openid。
    返回 {"openid": "...", "session_key": "..."} 或抛出 ValueError。
    """
    if not wechat_login_configured():
        raise ValueError("未配置 WECHAT_APP_ID / WECHAT_APP_SECRET")
    params = {
        "appid": settings.WECHAT_APP_ID,
        "secret": settings.WECHAT_APP_SECRET,
        "js_code": js_code,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CODE2SESSION, params=params)
        data = resp.json()
    if data.get("errcode"):
        logger.warning("jscode2session failed: %s", data)
        raise ValueError(data.get("errmsg") or "微信登录失败")
    openid = data.get("openid")
    if not openid:
        raise ValueError("未获取到 openid")
    return {"openid": openid, "session_key": data.get("session_key")}


def build_out_trade_no(order_id: int) -> str:
    """商户订单号（微信支付 out_trade_no，最长 32 字符）"""
    return f"QMM{order_id:08d}{int(__import__('time').time()) % 100000:05d}"
