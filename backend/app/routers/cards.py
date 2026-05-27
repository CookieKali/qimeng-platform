"""模块1：数字名片 + 模块2：动态状态条"""
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.card import Card
from ..models.profile import MemberProfile
from ..core.response import ok
from ..deps import get_current_user
from ..schemas.card import CardUpdate, StatusUpdate
from ..schemas.profile import ProfileUpdate
from .profile_sync import (
    apply_profile_update,
    get_or_create_card,
    member_profile_response,
)

router = APIRouter(prefix="/api/profile", tags=["card"])
v1_router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


def _load_profile(db: Session, user: User):
    card = user.card or Card(user_id=user.id)
    mp = db.query(MemberProfile).filter(MemberProfile.user_id == user.id).first()
    return mp, card


@router.get("/")
def get_my_card(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mp, card = _load_profile(db, user)
    return ok(member_profile_response(mp, card))


@v1_router.get("/")
def v1_get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    mp, card = _load_profile(db, user)
    return ok(member_profile_response(mp, card))


@router.put("/")
def update_card(payload: CardUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = payload.model_dump(exclude_unset=True)
    apply_profile_update(db, user, data)
    db.commit()
    return ok(msg="名片已更新")


def _v1_save_profile(
    payload: ProfileUpdate,
    user: User,
    db: Session,
):
    data = payload.model_dump(exclude_unset=True)
    apply_profile_update(db, user, data)
    db.commit()
    return ok(msg="名片已更新")


@v1_router.put("/")
def v1_update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _v1_save_profile(payload, user, db)


@v1_router.post("/")
def v1_update_profile_post(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """POST alias for miniprogram (wx.request only JSON-serializes POST bodies reliably)."""
    return _v1_save_profile(payload, user, db)


@router.put("/status")
def update_status(payload: StatusUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """V1.0 动态状态条"""
    c = get_or_create_card(db, user)
    if payload.status_supply is not None:
        c.status_supply = payload.status_supply
    if payload.status_demand is not None:
        c.status_demand = payload.status_demand
    c.status_updated_at = datetime.utcnow()
    mp = db.query(MemberProfile).filter(MemberProfile.user_id == user.id).first()
    if mp:
        if payload.status_supply is not None:
            mp.resources_text = payload.status_supply
        if payload.status_demand is not None:
            mp.needs_text = payload.status_demand
    db.commit()
    return ok(msg="动态已更新")


@router.post("/voice")
async def voice_input(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """语音输入 - V1.0 三种录入之一（演示用：返回模拟解析）"""
    content = await file.read()
    return ok({
        "transcript": f"已收到 {len(content)} bytes 语音，请在生产环境接入腾讯云ASR",
        "parsed": {"bio": "(语音解析占位)"},
    })


@router.post("/document")
async def doc_input(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    """文档读取 - 演示用"""
    content = await file.read()
    return ok({
        "filename": file.filename,
        "parsed": {"bio": f"已解析{file.filename}，{len(content)}字节"},
    })
