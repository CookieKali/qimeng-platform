"""用户列表/搜索 - 用于发现/匹配"""
from datetime import datetime, timedelta

import io

import qrcode
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, cast, String, case

from ..database import get_db
from ..models.user import User
from ..models.card import Card
from ..models.friend import FriendRelation, FriendRequest
from ..models.activity import Activity, ActivityCheckin
from ..core.response import ok
from ..core.avatars import save_user_avatar
from ..deps import get_optional_user, get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])
v1_router = APIRouter(prefix="/api/v1/users", tags=["users"])

ACTIVITY_CIRCLE_EXPIRE_DAYS = 15

ROLE_LABELS = {
    "partner": "合伙人",
    "paid": "企业主",
    "investor": "投资人",
    "mentor": "专家",
    "normal": "销售",
    "station_admin": "合伙人",
    "super_admin": "合伙人",
}


def _role_label(role: str) -> str:
    return ROLE_LABELS.get(role, role or "标准")


def _json_unicode_escape_literal(keyword: str) -> str:
    """SQLite JSON columns may store CJK as \\uXXXX escapes."""
    return "".join(f"\\u{ord(ch):04x}" for ch in keyword)


def _is_friend(db: Session, viewer_id: int, target_id: int) -> bool:
    return db.query(FriendRelation).filter(
        FriendRelation.user_id == viewer_id,
        FriendRelation.friend_id == target_id,
    ).first() is not None


def _mask_two_chars(value: str) -> str:
    text = (value or "").strip()
    if len(text) >= 2:
        return text[:2] + "**"
    if len(text) == 1:
        return text + "**"
    return "**"


@v1_router.get("/activity-circle")
def activity_circle(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """同场活动参与者（非好友），超期脱敏"""
    now = datetime.utcnow()
    my_activity_ids = [
        c.activity_id
        for c in db.query(ActivityCheckin).filter(ActivityCheckin.user_id == user.id).all()
    ]
    if not my_activity_ids:
        return ok({"items": [], "total": 0})

    friend_ids = {
        r.friend_id
        for r in db.query(FriendRelation).filter(FriendRelation.user_id == user.id).all()
    }
    activities = {
        a.id: a
        for a in db.query(Activity).filter(Activity.id.in_(my_activity_ids)).all()
    }
    co_map: dict[int, dict] = {}

    checkins = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id.in_(my_activity_ids)
    ).all()
    for ck in checkins:
        other_id = ck.user_id
        if other_id == user.id or other_id in friend_ids:
            continue
        joined_at = ck.signed_up_at or now
        act = activities.get(ck.activity_id)
        activity_name = act.title if act else ""
        prev = co_map.get(other_id)
        if not prev or joined_at < prev["joined_at"]:
            co_map[other_id] = {"joined_at": joined_at, "activity_name": activity_name}

    items = []
    for other_id, meta in co_map.items():
        u = db.query(User).filter(User.id == other_id, User.status == "active").first()
        if not u:
            continue
        card = u.card
        joined_at = meta["joined_at"]
        is_expired = (now - joined_at) > timedelta(days=ACTIVITY_CIRCLE_EXPIRE_DAYS)

        raw_name = u.name or ""
        raw_co = (card.company if card else "") or ""
        raw_job = (card.job_title if card else "") or ""

        if is_expired:
            display_name = _mask_two_chars(raw_name)
            display_co = _mask_two_chars(raw_co)
            display_job = ""
            name_abbr = (display_name.replace("**", "") or "**")[:2]
        else:
            display_name = raw_name
            display_co = raw_co
            display_job = raw_job
            name_abbr = raw_name[:2] if raw_name else ""

        items.append({
            "id": u.id,
            "name": display_name,
            "nameAbbr": name_abbr,
            "job": display_job,
            "co": display_co,
            "avatar_url": u.avatar_url or "",
            "activity_name": meta["activity_name"],
            "joined_at": joined_at.strftime("%Y-%m-%d"),
            "is_expired": is_expired,
        })

    items.sort(key=lambda x: x["joined_at"], reverse=True)
    return ok({"items": items, "total": len(items)})


@v1_router.post("/me/avatar")
async def upload_my_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传当前用户头像（好友可见）"""
    rel_path = save_user_avatar(user.id, file)
    user.avatar_url = rel_path
    db.commit()
    return ok({"avatar_url": rel_path}, msg="头像已更新")


@v1_router.get("/{user_id}/qrcode")
def user_profile_qrcode(user_id: int, db: Session = Depends(get_db)):
    """生成名片分享二维码 PNG"""
    u = db.query(User).filter(User.id == user_id, User.status == "active").first()
    if not u:
        raise HTTPException(404, "用户不存在")
    payload = f"https://qimeng.app/profile/{user_id}"
    qr = qrcode.QRCode(version=1, box_size=8, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return Response(content=buf.getvalue(), media_type="image/png")


def _friend_status(db: Session, viewer_id: int, target_id: int) -> str:
    """none | friend | pending_sent | pending_in"""
    if _is_friend(db, viewer_id, target_id):
        return "friend"
    if db.query(FriendRequest).filter(
        FriendRequest.from_user_id == viewer_id,
        FriendRequest.to_user_id == target_id,
        FriendRequest.status == "pending",
    ).first():
        return "pending_sent"
    if db.query(FriendRequest).filter(
        FriendRequest.from_user_id == target_id,
        FriendRequest.to_user_id == viewer_id,
        FriendRequest.status == "pending",
    ).first():
        return "pending_in"
    return "none"


@router.get("/")
def list_users(
    region: str = "全部",
    industry: str = "全部",
    role: str = "全部",
    keyword: str = "",
    page: int = 1,
    page_size: int = 30,
    db: Session = Depends(get_db),
    me=Depends(get_optional_user),
):
    """用户列表 - 数据库层面过滤"""
    # 基础查询
    q = db.query(User).filter(User.status == "active")
    
    # 预加载卡片信息
    q = q.options(joinedload(User.card))
    
    # 关键词：姓名 / 公司 / 职务 / 商业版图(产品·业务) — OR LIKE，忽略大小写
    kw = (keyword or "").strip()
    if kw:
        pattern = f"%{kw}%"
        q = q.outerjoin(Card, User.id == Card.user_id)
        nocase_like = lambda col: col.collate("NOCASE").like(pattern)
        bm_text = cast(Card.business_map, String)
        q = q.filter(or_(
            nocase_like(User.name),
            nocase_like(Card.company),
            nocase_like(Card.job_title),
            nocase_like(bm_text),
            bm_text.like(f"%{_json_unicode_escape_literal(kw)}%"),
        ))

    rep_order = case(
        (User.reputation_level == "SSS", 1),
        (User.reputation_level == "SS", 2),
        (User.reputation_level == "S", 3),
        (User.reputation_level == "A", 4),
        (User.reputation_level == "B", 5),
        else_=6,
    )
    q = q.order_by(rep_order.asc(), User.is_paid.desc())

    # 先获取所有用户，然后在内存中过滤卡片信息（因为卡片信息是关联的）
    offset = (page - 1) * page_size
    users = q.offset(offset).limit(page_size).all()
    total = q.count()
    
    items = []
    for u in users:
        c = u.card or Card(user_id=u.id)
        
        # 内存过滤
        if region != "全部" and c.region != region:
            continue
        if industry != "全部" and c.industry != industry:
            continue
        
        role_label = _role_label(u.role)
        if role != "全部" and role_label != role:
            continue
        
        item = {
            "id": u.id, "name": u.name, "avatar_url": u.avatar_url,
            "company": c.company, "job_title": c.job_title,
            "industry": c.industry, "region": c.region,
            "role": role_label, "level": "VIP" if u.is_paid else "标准",
            "is_paid": u.is_paid,
            "reputation_level": u.reputation_level,
            "bio": c.bio, "tags": c.tags or [],
        }
        if me:
            item["friend_status"] = _friend_status(db, me.id, u.id)
        items.append(item)
    
    return ok({"items": items, "total": total})


@router.get("/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db),
             me=Depends(get_optional_user)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return ok(None)
    c = u.card
    show_contact = me and (me.id == u.id or _is_friend(db, me.id, user_id))
    payload = {
        "id": u.id, "name": u.name, "avatar_url": u.avatar_url,
        "phone": u.phone if show_contact else "",
        "email": u.email if show_contact else "",
        "role": u.role, "is_paid": u.is_paid,
        "reputation_level": u.reputation_level,
        "card": {
            "company": c.company, "job_title": c.job_title,
            "industry": c.industry, "region": c.region, "bio": c.bio,
            "interests": c.interests, "talents": c.talents,
            "resources": c.resources, "needs": c.needs, "tags": c.tags,
            "social_titles": c.social_titles, "honors": c.honors,
            "business_map": c.business_map,
            "status_supply": c.status_supply, "status_demand": c.status_demand,
        } if c else None,
    }
    if me:
        payload["friend_status"] = _friend_status(db, me.id, user_id)
    return ok(payload)
