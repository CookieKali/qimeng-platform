"""名片分享相关路由"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from ..database import get_db
from ..models.user import User
from ..models.card_share import CardShare
from ..core.response import ok
from ..deps import get_current_user, get_optional_user

router = APIRouter(prefix="/api/v1/card-shares", tags=["card-shares"])


class CreateCardShareRequest(BaseModel):
    share_type: str = Field(default="card", description="分享类型: card/invite")
    share_channel: str | None = Field(default=None, description="分享渠道")


@router.post("/create")
def create_card_share(
    req: CreateCardShareRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """创建名片分享记录"""
    share_code = f"CS{uuid.uuid4().hex[:10].upper()}"
    
    card_share = CardShare(
        sharer_id=user.id,
        share_type=req.share_type,
        share_channel=req.share_channel,
        share_code=share_code,
    )
    
    db.add(card_share)
    user.total_shares += 1
    db.commit()
    db.refresh(card_share)
    
    return ok({
        "id": card_share.id,
        "share_code": share_code,
        "share_type": card_share.share_type,
        "created_at": card_share.created_at.isoformat() if card_share.created_at else None,
    })


@router.get("/my-shares")
def get_my_shares(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取我的分享记录"""
    shares = db.query(CardShare).filter(
        CardShare.sharer_id == user.id
    ).order_by(CardShare.created_at.desc()).limit(50).all()
    
    items = []
    for share in shares:
        items.append({
            "id": share.id,
            "share_code": share.share_code,
            "share_type": share.share_type,
            "share_channel": share.share_channel,
            "view_count": share.view_count,
            "register_count": share.register_count,
            "created_at": share.created_at.isoformat() if share.created_at else None,
        })
    
    return ok({
        "items": items,
        "total_shares": user.total_shares,
        "total_views": user.total_views,
        "total_registers": user.total_registers,
    })


@router.get("/trace/{share_code}")
def trace_share(
    share_code: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_optional_user),
):
    """通过分享码获取分享信息（访问时调用）"""
    card_share = db.query(CardShare).filter(
        CardShare.share_code == share_code
    ).first()
    
    if not card_share:
        raise HTTPException(status_code=404, detail="分享链接无效或已过期")
    
    # 增加浏览量
    card_share.view_count += 1
    sharer = db.query(User).filter(User.id == card_share.sharer_id).first()
    if sharer:
        sharer.total_views += 1
    db.commit()
    
    # 返回分享者信息
    sharer_info = {}
    if sharer:
        sharer_info = {
            "id": sharer.id,
            "name": sharer.name,
            "avatar_url": sharer.avatar_url or "",
            "invite_code": sharer.invite_code or "",
        }
        if sharer.card:
            sharer_info["card"] = {
                "company": sharer.card.company,
                "job_title": sharer.card.job_title,
            }
    
    return ok({
        "share_code": share_code,
        "share_type": card_share.share_type,
        "sharer": sharer_info,
    })


@router.post("/register/{share_code}")
def register_from_share(
    share_code: str,
    db: Session = Depends(get_db),
):
    """通过分享链接注册后记录（由注册流程回调）"""
    card_share = db.query(CardShare).filter(
        CardShare.share_code == share_code
    ).first()
    
    if not card_share:
        raise HTTPException(status_code=404, detail="分享链接无效")
    
    # 增加注册量
    card_share.register_count += 1
    sharer = db.query(User).filter(User.id == card_share.sharer_id).first()
    if sharer:
        sharer.total_registers += 1
    db.commit()
    
    return ok({
        "success": True,
        "sharer_id": card_share.sharer_id,
    })
