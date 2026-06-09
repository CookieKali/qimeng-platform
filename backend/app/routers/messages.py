"""好友私信"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.friend import FriendRelation
from ..models.message import Message
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/messages", tags=["messages"])

MAX_CONTENT_LEN = 500


class MessageSend(BaseModel):
    to_user_id: int
    content: str = Field(..., min_length=1, max_length=MAX_CONTENT_LEN)


def _are_friends(db: Session, user_id: int, other_id: int) -> bool:
    if user_id == other_id:
        return False
    a = db.query(FriendRelation).filter(
        FriendRelation.user_id == user_id,
        FriendRelation.friend_id == other_id,
    ).first()
    b = db.query(FriendRelation).filter(
        FriendRelation.user_id == other_id,
        FriendRelation.friend_id == user_id,
    ).first()
    return a is not None and b is not None


def _format_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.isoformat()


def _serialize_message(m: Message, current_user_id: int) -> dict:
    return {
        "id": m.id,
        "from_user_id": m.from_user_id,
        "content": m.content or "",
        "is_read": bool(m.is_read),
        "created_at": _format_dt(m.created_at),
        "is_mine": m.from_user_id == current_user_id,
    }


@router.post("/send")
def send_message(
    payload: MessageSend,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(400, "消息内容不能为空")
    if len(content) > MAX_CONTENT_LEN:
        raise HTTPException(400, f"消息长度不能超过 {MAX_CONTENT_LEN} 字")
    if payload.to_user_id == user.id:
        raise HTTPException(400, "不能给自己发消息")
    target = db.query(User).filter(
        User.id == payload.to_user_id,
        User.status == "active",
    ).first()
    if not target:
        raise HTTPException(404, "收件用户不存在")
    if not _are_friends(db, user.id, payload.to_user_id):
        raise HTTPException(403, "仅可向好友发送私信")

    msg = Message(from_user_id=user.id, to_user_id=payload.to_user_id, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return ok({
        "id": msg.id,
        "content": msg.content,
        "created_at": _format_dt(msg.created_at),
    })


@router.get("/conversation/{other_user_id}")
def get_conversation(
    other_user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.query(User).filter(User.id == other_user_id, User.status == "active").first()
    if not other:
        raise HTTPException(404, "用户不存在")
    if not _are_friends(db, user.id, other_user_id):
        raise HTTPException(403, "仅可查看与好友的会话")

    db.query(Message).filter(
        Message.to_user_id == user.id,
        Message.from_user_id == other_user_id,
        Message.is_read == False,
    ).update({Message.is_read: True}, synchronize_session=False)

    rows = (
        db.query(Message)
        .filter(
            or_(
                (Message.from_user_id == user.id) & (Message.to_user_id == other_user_id),
                (Message.from_user_id == other_user_id) & (Message.to_user_id == user.id),
            )
        )
        .order_by(Message.created_at.asc())
        .all()
    )
    db.commit()
    items = [_serialize_message(m, user.id) for m in rows]
    return ok({
        "items": items,
        "total": len(items),
        "peer": {
            "id": other.id,
            "name": other.name or "",
            "avatar_url": other.avatar_url or "",
        },
    })


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    total = db.query(Message).filter(
        Message.to_user_id == user.id,
        Message.is_read == False,
    ).count()

    grouped = (
        db.query(
            Message.from_user_id,
            func.count(Message.id).label("count"),
        )
        .filter(Message.to_user_id == user.id, Message.is_read == False)
        .group_by(Message.from_user_id)
        .all()
    )
    by_sender = []
    for from_user_id, count in grouped:
        sender = db.query(User).filter(User.id == from_user_id).first()
        by_sender.append({
            "from_user_id": from_user_id,
            "from_name": sender.name if sender else "",
            "count": int(count),
        })
    by_sender.sort(key=lambda x: x["count"], reverse=True)
    return ok({"total": total, "by_sender": by_sender})


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Message)
        .filter(or_(Message.from_user_id == user.id, Message.to_user_id == user.id))
        .order_by(Message.created_at.desc())
        .all()
    )
    conv_map: dict[int, dict] = {}
    for m in rows:
        other_id = m.to_user_id if m.from_user_id == user.id else m.from_user_id
        if other_id not in conv_map:
            conv_map[other_id] = {
                "user_id": other_id,
                "last_message": m.content or "",
                "last_time": _format_dt(m.created_at),
                "unread_count": 0,
            }
        if m.to_user_id == user.id and not m.is_read:
            conv_map[other_id]["unread_count"] += 1

    items = []
    for other_id, meta in conv_map.items():
        u = db.query(User).filter(User.id == other_id).first()
        items.append({
            "user_id": other_id,
            "name": u.name if u else "",
            "avatar_url": u.avatar_url if u else "",
            "last_message": meta["last_message"],
            "last_time": meta["last_time"],
            "unread_count": meta["unread_count"],
        })
    items.sort(key=lambda x: x["last_time"], reverse=True)
    return ok({"items": items, "total": len(items)})
