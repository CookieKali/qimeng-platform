"""站内信箱"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.friend import FriendRelation
from ..models.inbox import InboxMessage, INBOX_TYPES
from ..models.task import Task
from ..models.activity import Activity
from ..services.inbox import send_inbox_message
from ..core.response import ok
from ..deps import get_current_user

router = APIRouter(prefix="/api/v1/inbox", tags=["inbox"])


class InboxSend(BaseModel):
    to_user_id: int
    type: str
    title: str
    content: str = ""
    related_id: Optional[int] = None


class ShareCardIn(BaseModel):
    card_user_id: int
    to_user_ids: List[int] = Field(..., min_length=1, max_length=30)


class ShareTaskIn(BaseModel):
    task_id: int
    to_user_ids: List[int] = Field(..., min_length=1, max_length=30)


class ShareActivityIn(BaseModel):
    activity_id: int
    to_user_ids: List[int] = Field(..., min_length=1, max_length=30)


def _format_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y-%m-%d %H:%M")


def _serialize_message(db: Session, m: InboxMessage) -> dict:
    from_name = ""
    if m.from_user_id:
        u = db.query(User).filter(User.id == m.from_user_id).first()
        from_name = u.name if u else ""
    return {
        "id": m.id,
        "from_user_id": m.from_user_id,
        "from_name": from_name,
        "to_user_id": m.to_user_id,
        "type": m.type,
        "title": m.title,
        "content": m.content,
        "related_id": m.related_id,
        "is_read": m.is_read,
        "created_at": _format_dt(m.created_at),
    }


@router.post("/send")
def send_message(payload: InboxSend, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.type not in INBOX_TYPES:
        raise HTTPException(400, f"type 须为: {', '.join(INBOX_TYPES)}")
    target = db.query(User).filter(User.id == payload.to_user_id, User.status == "active").first()
    if not target:
        raise HTTPException(404, "收件用户不存在")
    msg = send_inbox_message(
        db,
        from_user_id=user.id,
        to_user_id=payload.to_user_id,
        type=payload.type,
        title=payload.title,
        content=payload.content,
        related_id=payload.related_id,
    )
    db.commit()
    db.refresh(msg)
    return ok({"id": msg.id}, msg="已发送")


@router.post("/share-card")
def share_card(payload: ShareCardIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """转发数字名片给多位好友（站内信）"""
    if payload.card_user_id == user.id:
        raise HTTPException(400, "不能转发自己的名片")
    card_user = db.query(User).filter(
        User.id == payload.card_user_id,
        User.status == "active",
    ).first()
    if not card_user:
        raise HTTPException(404, "名片用户不存在")

    card_name = card_user.name or "用户"
    sender_name = user.name or "好友"
    title = f"{sender_name}向你转发了「{card_name}」的名片"
    content = "点击查看名片"

    sent_ids: List[int] = []
    errors: List[str] = []
    seen = set()
    for to_id in payload.to_user_ids:
        if to_id in seen:
            continue
        seen.add(to_id)
        if to_id == user.id:
            errors.append("不能发送给自己")
            continue
        target = db.query(User).filter(User.id == to_id, User.status == "active").first()
        if not target:
            errors.append(f"用户 #{to_id} 不存在")
            continue
        is_friend = db.query(FriendRelation).filter(
            FriendRelation.user_id == user.id,
            FriendRelation.friend_id == to_id,
        ).first()
        if not is_friend:
            errors.append(f"与 {target.name or '对方'} 不是好友，无法转发")
            continue
        send_inbox_message(
            db,
            from_user_id=user.id,
            to_user_id=to_id,
            type="card_share",
            title=title,
            content=content,
            related_id=card_user.id,
        )
        sent_ids.append(to_id)

    if not sent_ids:
        raise HTTPException(400, errors[0] if errors else "发送失败，请确认已选好友")
    db.commit()
    return ok({"sent": len(sent_ids), "to_user_ids": sent_ids}, msg=f"已发送给 {len(sent_ids)} 位好友")


def _share_to_friends(
    db: Session,
    sender: User,
    to_user_ids: List[int],
    msg_type: str,
    title: str,
    content: str,
    related_id: int,
) -> tuple:
    sent_ids: List[int] = []
    errors: List[str] = []
    seen = set()
    for to_id in to_user_ids:
        if to_id in seen:
            continue
        seen.add(to_id)
        if to_id == sender.id:
            errors.append("不能发送给自己")
            continue
        target = db.query(User).filter(User.id == to_id, User.status == "active").first()
        if not target:
            errors.append(f"用户 #{to_id} 不存在")
            continue
        is_friend = db.query(FriendRelation).filter(
            FriendRelation.user_id == sender.id,
            FriendRelation.friend_id == to_id,
        ).first()
        if not is_friend:
            errors.append(f"与 {target.name or '对方'} 不是好友，无法转发")
            continue
        send_inbox_message(
            db,
            from_user_id=sender.id,
            to_user_id=to_id,
            type=msg_type,
            title=title,
            content=content,
            related_id=related_id,
        )
        sent_ids.append(to_id)
    return sent_ids, errors


@router.post("/share-task")
def share_task(payload: ShareTaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """转发任务给企盟好友（站内信）"""
    task = db.query(Task).filter(Task.id == payload.task_id).first()
    if not task:
        raise HTTPException(404, "任务不存在")
    sender_name = user.name or "好友"
    title = f"{sender_name}向你转发了任务「{task.title or '未命名任务'}」"
    content = (task.description or "")[:200] or "点击查看任务详情"
    sent_ids, errors = _share_to_friends(
        db, user, payload.to_user_ids, "task_share", title, content, task.id
    )
    if not sent_ids:
        raise HTTPException(400, errors[0] if errors else "发送失败，请确认已选好友")
    db.commit()
    return ok({"sent": len(sent_ids), "to_user_ids": sent_ids}, msg=f"已转发给 {len(sent_ids)} 位好友")


@router.post("/share-activity")
def share_activity(
    payload: ShareActivityIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """转发活动给企盟好友（站内信）"""
    activity = db.query(Activity).filter(Activity.id == payload.activity_id).first()
    if not activity:
        raise HTTPException(404, "活动不存在")
    sender_name = user.name or "好友"
    title = f"{sender_name}向你转发了活动「{activity.title or '未命名活动'}」"
    loc = activity.location or ""
    content = loc or (activity.description or "")[:200] or "点击查看活动详情"
    sent_ids, errors = _share_to_friends(
        db, user, payload.to_user_ids, "activity_share", title, content, activity.id
    )
    if not sent_ids:
        raise HTTPException(400, errors[0] if errors else "发送失败，请确认已选好友")
    db.commit()
    return ok({"sent": len(sent_ids), "to_user_ids": sent_ids}, msg=f"已转发给 {len(sent_ids)} 位好友")


@router.post("/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(InboxMessage).filter(
        InboxMessage.to_user_id == user.id,
        InboxMessage.is_read == False,  # noqa: E712
    )
    count = q.count()
    if count:
        q.update({InboxMessage.is_read: True}, synchronize_session=False)
        db.commit()
    return ok({"marked": count}, msg="已全部标记为已读")


@router.get("/list")
def list_messages(
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    page = max(1, page)
    page_size = min(max(1, page_size), 50)
    q = db.query(InboxMessage).filter(InboxMessage.to_user_id == user.id)
    total = q.count()
    unread_count = q.filter(InboxMessage.is_read == False).count()  # noqa: E712
    rows = (
        q.order_by(InboxMessage.is_read.asc(), InboxMessage.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_message(db, m) for m in rows]
    return ok({"items": items, "total": total, "page": page, "page_size": page_size, "unread_count": unread_count})


@router.get("/unread-count")
def unread_count(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    count = db.query(InboxMessage).filter(
        InboxMessage.to_user_id == user.id,
        InboxMessage.is_read == False,  # noqa: E712
    ).count()
    return ok({"count": count})


@router.patch("/{message_id}/read")
def mark_read(message_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.query(InboxMessage).filter(
        InboxMessage.id == message_id,
        InboxMessage.to_user_id == user.id,
    ).first()
    if not m:
        raise HTTPException(404, "消息不存在")
    if not m.is_read:
        m.is_read = True
        db.commit()
    return ok({"id": m.id, "is_read": True}, msg="已标记为已读")
