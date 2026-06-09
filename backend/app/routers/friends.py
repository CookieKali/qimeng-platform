"""模块3：通讯录与好友（含场景溯源、关系图谱）"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from ..database import get_db
from ..models.user import User
from ..models.friend import FriendRelation, FriendRequest
from ..models.saved_card import SavedCard
from ..models.inbox import InboxMessage
from ..core.response import ok
from ..deps import get_current_user
from ..services.inbox import send_inbox_message
from ..core.profit_share import linker_badge

router = APIRouter(prefix="/api/friends", tags=["friends"])
v1_router = APIRouter(prefix="/api/v1/friends", tags=["friends"])


class SaveCardBody(BaseModel):
    user_id: int


def _mark_friend_request_inbox_read(db: Session, user_id: int, req_id: int) -> None:
    """接受/拒绝好友申请后，同步将对应站内信标为已读"""
    db.query(InboxMessage).filter(
        InboxMessage.to_user_id == user_id,
        InboxMessage.type == "friend_request",
        InboxMessage.related_id == req_id,
        InboxMessage.is_read == False,  # noqa: E712
    ).update({InboxMessage.is_read: True}, synchronize_session=False)


def _are_friends(db: Session, user_id: int, other_id: int) -> bool:
    return db.query(FriendRelation).filter(
        FriendRelation.user_id == user_id,
        FriendRelation.friend_id == other_id,
    ).first() is not None


def _pending_between(db: Session, user_a: int, user_b: int):
    """两人之间所有 pending 申请（双向）"""
    return db.query(FriendRequest).filter(
        FriendRequest.status == "pending",
        or_(
            and_(FriendRequest.from_user_id == user_a, FriendRequest.to_user_id == user_b),
            and_(FriendRequest.from_user_id == user_b, FriendRequest.to_user_id == user_a),
        ),
    )


def _close_stale_pending_for_viewer(db: Session, viewer_id: int) -> None:
    """已是好友却仍挂着 pending 的旧记录，自动收口避免列表重复"""
    stale = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == viewer_id,
        FriendRequest.status == "pending",
    ).all()
    changed = False
    for r in stale:
        if _are_friends(db, viewer_id, r.from_user_id):
            r.status = "accepted"
            _mark_friend_request_inbox_read(db, viewer_id, r.id)
            changed = True
    if changed:
        db.commit()


def _user_brief(db: Session, user_id: int) -> dict:
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return {"name": "", "job_title": "", "company": "", "avatar_url": ""}
    c = u.card
    return {
        "name": u.name,
        "job_title": c.job_title if c else "",
        "company": c.company if c else "",
        "avatar_url": u.avatar_url or "",
    }


@router.get("/")
def list_friends(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rels = db.query(FriendRelation).filter(FriendRelation.user_id == user.id).all()
    items = []
    for r in rels:
        f = db.query(User).filter(User.id == r.friend_id).first()
        if not f:
            continue
        c = f.card
        items.append({
            "id": f.id, "name": f.name, "avatar_url": f.avatar_url,
            "company": c.company if c else "", "job_title": c.job_title if c else "",
            "region": c.region if c else "", "industry": c.industry if c else "",
            "role": f.role,
            "linker_badge": linker_badge(f),
            "level": "VIP" if f.is_paid else "标准",
            "reputation_level": f.reputation_level,
            "tags": c.tags if c else [],
            "scene": r.scene, "group": r.group_name, "coop": r.coop_count,
        })
    return ok({"items": items, "total": len(items)})


@router.post("/request/{to_user_id}")
def add_friend(to_user_id: int, msg: str = "", scene: str = "recommend",
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if to_user_id == user.id:
        raise HTTPException(400, "不能添加自己")
    target = db.query(User).filter(User.id == to_user_id, User.status == "active").first()
    if not target:
        raise HTTPException(404, "用户不存在")

    if _are_friends(db, user.id, to_user_id):
        # 清理可能残留的同对 pending
        for r in _pending_between(db, user.id, to_user_id).all():
            r.status = "accepted"
        db.commit()
        return ok(msg="已是好友")

    incoming = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == to_user_id,
        FriendRequest.to_user_id == user.id,
        FriendRequest.status == "pending",
    ).first()
    if incoming:
        return ok(
            {"request_id": incoming.id, "hint": "incoming"},
            msg="对方已向你发送申请，请在「好友申请」处接受",
        )

    outgoing = _pending_between(db, user.id, to_user_id).filter(
        FriendRequest.from_user_id == user.id,
    ).order_by(FriendRequest.created_at.desc()).first()
    if outgoing:
        if msg:
            outgoing.msg = msg
            db.commit()
        return ok({"request_id": outgoing.id}, msg="已发送过申请，等待对方确认")

    # 同方向曾发过申请（含已接受/已拒绝），不再插入第二条，避免列表重复
    prior = db.query(FriendRequest).filter(
        FriendRequest.from_user_id == user.id,
        FriendRequest.to_user_id == to_user_id,
    ).order_by(FriendRequest.created_at.desc()).first()
    if prior and prior.status != "pending":
        prior.status = "pending"
        prior.msg = msg or prior.msg or "申请互换名片"
        send_inbox_message(
            db,
            from_user_id=user.id,
            to_user_id=to_user_id,
            type="friend_request",
            title=f"{user.name or '用户'}申请加好友",
            content=prior.msg,
            related_id=prior.id,
        )
        db.commit()
        db.refresh(prior)
        return ok({"request_id": prior.id}, msg="申请已发出")

    req = FriendRequest(from_user_id=user.id, to_user_id=to_user_id, msg=msg or "申请互换名片")
    db.add(req)
    db.flush()
    send_inbox_message(
        db,
        from_user_id=user.id,
        to_user_id=to_user_id,
        type="friend_request",
        title=f"{user.name or '用户'}申请加好友",
        content=req.msg,
        related_id=req.id,
    )
    db.commit()
    db.refresh(req)
    return ok({"request_id": req.id}, msg="申请已发出")


@router.get("/requests/pending")
def pending_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _close_stale_pending_for_viewer(db, user.id)
    items = []
    seen_from = set()
    dirty = False
    rows = db.query(FriendRequest).filter(
        FriendRequest.to_user_id == user.id, FriendRequest.status == "pending"
    ).order_by(FriendRequest.created_at.desc()).all()
    for r in rows:
        if _are_friends(db, user.id, r.from_user_id):
            r.status = "accepted"
            dirty = True
            continue
        if r.from_user_id in seen_from:
            r.status = "accepted"
            dirty = True
            continue
        seen_from.add(r.from_user_id)
        brief = _user_brief(db, r.from_user_id)
        items.append({
            "request_id": r.id,
            "from_user_id": r.from_user_id,
            "name": brief["name"],
            "job_title": brief["job_title"],
            "company": brief["company"],
            "avatar_url": brief["avatar_url"],
            "msg": r.msg,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    if dirty:
        db.commit()
    return ok({"items": items, "total": len(items)})


@router.get("/requests/sent")
def sent_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """我发出的、待对方处理的申请"""
    items = []
    for r in db.query(FriendRequest).filter(
        FriendRequest.from_user_id == user.id, FriendRequest.status == "pending"
    ).all():
        brief = _user_brief(db, r.to_user_id)
        items.append({
            "request_id": r.id,
            "to_user_id": r.to_user_id,
            "name": brief["name"],
            "job_title": brief["job_title"],
            "company": brief["company"],
            "msg": r.msg,
        })
    return ok({"items": items, "total": len(items)})


@router.post("/requests/{req_id}/accept")
def accept_request(req_id: int, scene: str = "request",
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(FriendRequest).filter(
        FriendRequest.id == req_id,
        FriendRequest.to_user_id == user.id,
        FriendRequest.status == "pending",
    ).first()
    if not r:
        raise HTTPException(404, "申请不存在或已处理")
    other_id = r.from_user_id
    if not _are_friends(db, other_id, user.id):
        db.add(FriendRelation(user_id=other_id, friend_id=user.id, scene=scene or "request"))
    if not _are_friends(db, user.id, other_id):
        db.add(FriendRelation(user_id=user.id, friend_id=other_id, scene=scene or "request"))
    for dup in _pending_between(db, other_id, user.id).all():
        dup.status = "accepted"
    _mark_friend_request_inbox_read(db, user.id, req_id)
    from ..core.contribution import grant_contribution_once

    other = db.query(User).filter(User.id == other_id).first()
    pair_key = f"pair_{min(user.id, other_id)}_{max(user.id, other_id)}"
    if other:
        grant_contribution_once(
            db, user, "friend_accept", 20, related_entity=pair_key, note="好友申请已接受"
        )
        grant_contribution_once(
            db, other, "friend_accept", 20, related_entity=pair_key, note="好友申请已接受"
        )
    db.commit()
    return ok(msg="已成为好友")


@router.post("/requests/{req_id}/reject")
def reject_request(req_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(FriendRequest).filter(
        FriendRequest.id == req_id,
        FriendRequest.to_user_id == user.id,
        FriendRequest.status == "pending",
    ).first()
    if not r:
        raise HTTPException(404, "申请不存在或已处理")
    other_id = r.from_user_id
    for dup in db.query(FriendRequest).filter(
        FriendRequest.from_user_id == other_id,
        FriendRequest.to_user_id == user.id,
        FriendRequest.status == "pending",
    ).all():
        dup.status = "rejected"
    _mark_friend_request_inbox_read(db, user.id, req_id)
    db.commit()
    return ok(msg="已忽略该申请")


def _active_saved(db: Session, from_user_id: int, saved_user_id: int):
    return db.query(SavedCard).filter(
        SavedCard.from_user_id == from_user_id,
        SavedCard.saved_user_id == saved_user_id,
        SavedCard.deleted_at.is_(None),
    ).first()


@v1_router.post("/save-card")
def save_card(
    body: SaveCardBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """单向保存名片，不创建好友申请"""
    target_id = body.user_id
    if target_id == user.id:
        raise HTTPException(400, "不能保存自己")

    target = db.query(User).filter(User.id == target_id, User.status == "active").first()
    if not target:
        raise HTTPException(404, "用户不存在")

    if _are_friends(db, user.id, target_id):
        return ok({"hint": "already_friend"}, msg="已是好友")

    existing = db.query(SavedCard).filter(
        SavedCard.from_user_id == user.id,
        SavedCard.saved_user_id == target_id,
    ).first()

    if existing:
        if existing.deleted_at is None:
            return ok({"saved": True, "user_id": target_id}, msg="已保存名片")
        existing.deleted_at = None
        existing.created_at = datetime.utcnow()
        db.commit()
        return ok({"saved": True, "user_id": target_id}, msg="已保存名片")

    row = SavedCard(from_user_id=user.id, saved_user_id=target_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return ok({"saved": True, "user_id": target_id, "id": row.id}, msg="已保存名片")


@v1_router.delete("/save-card/{user_id}")
def unsave_card(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """取消保存（软删除）"""
    row = _active_saved(db, user.id, user_id)
    if not row:
        return ok({"saved": False}, msg="未保存该名片")
    row.deleted_at = datetime.utcnow()
    db.commit()
    return ok({"saved": False, "user_id": user_id}, msg="已取消保存")


@v1_router.get("/saved")
def list_saved_cards(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """当前用户单向保存的名片列表"""
    rows = db.query(SavedCard).filter(
        SavedCard.from_user_id == user.id,
        SavedCard.deleted_at.is_(None),
    ).order_by(SavedCard.created_at.desc()).all()

    items = []
    ids = []
    dirty = False
    for r in rows:
        u = db.query(User).filter(User.id == r.saved_user_id).first()
        if not u:
            continue
        if _are_friends(db, user.id, u.id):
            r.deleted_at = datetime.utcnow()
            dirty = True
            continue
        c = u.card
        ids.append(u.id)
        items.append({
            "user_id": u.id,
            "id": u.id,
            "name": u.name,
            "avatar_url": u.avatar_url,
            "company": c.company if c else "",
            "job_title": c.job_title if c else "",
            "region": c.region if c else "",
            "reputation_level": u.reputation_level,
            "saved_at": r.created_at.isoformat() if r.created_at else None,
        })
    if dirty:
        db.commit()
    return ok({"items": items, "ids": ids, "total": len(items)})


@router.get("/graph")
def relation_graph(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """关系图谱可视化数据"""
    rels = db.query(FriendRelation).filter(FriendRelation.user_id == user.id).all()
    nodes = [{"id": user.id, "name": user.name, "level": user.reputation_level}]
    edges = []
    for r in rels:
        f = db.query(User).filter(User.id == r.friend_id).first()
        if f:
            nodes.append({"id": f.id, "name": f.name, "level": f.reputation_level})
            edges.append({"from": user.id, "to": f.id, "scene": r.scene, "coop": r.coop_count})
    return ok({"nodes": nodes, "edges": edges})
