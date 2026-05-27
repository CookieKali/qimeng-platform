"""模块1·9：用户注册/登录/付费审核"""
import uuid
import re
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.card import Card
from ..models.audit import AuditRecord
from ..models.profit import ChannelRelation
from ..core.security import hash_password, verify_password, create_access_token
from ..core.response import ok
from ..core.contribution import add_contribution
from ..deps import get_current_user
from ..schemas.auth import RegisterIn, LoginIn, ProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 手机号正则（中国大陆）
PHONE_PATTERN = re.compile(r'^1[3-9]\d{9}$')


def validate_phone(phone: str) -> bool:
    """验证手机号格式"""
    return bool(PHONE_PATTERN.match(phone))


def validate_password(password: str) -> tuple[bool, str]:
    """验证密码强度，返回 (是否有效, 提示信息)"""
    if len(password) < 6:
        return False, "密码长度不能少于6位"
    if len(password) > 64:
        return False, "密码长度不能超过64位"
    return True, ""


@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    # 验证手机号格式
    if not validate_phone(payload.phone):
        raise HTTPException(400, "手机号格式不正确")
    
    # 验证密码强度
    valid_pwd, pwd_msg = validate_password(payload.password)
    if not valid_pwd:
        raise HTTPException(400, pwd_msg)
    
    # 检查手机号是否已注册
    if db.query(User).filter(User.phone == payload.phone).first():
        raise HTTPException(400, "手机号已注册")
    
    # 处理邀请码
    inviter = None
    if payload.invite_code:
        inviter = db.query(User).filter(User.invite_code == payload.invite_code).first()
        if not inviter:
            raise HTTPException(400, "邀请码无效")
    
    # 创建用户
    user = User(
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        name=payload.name or f"用户{payload.phone[-4:]}",
        invite_code=f"QM-{uuid.uuid4().hex[:8].upper()}",
        inviter_id=inviter.id if inviter else None,
        status="active",
    )
    db.add(user)
    db.flush()
    
    # 创建用户卡片
    db.add(Card(user_id=user.id))
    
    # 建立推荐关系 + 邀请人贡献积分（invite_register 基础 50，含等级加成与信用联动）
    if inviter:
        db.add(ChannelRelation(referrer_id=inviter.id, referee_id=user.id, relation_type="recommend"))
        add_contribution(
            db, inviter, "invite_register", 50,
            related_entity=f"user_{user.id}",
            note="推荐新用户注册",
        )

    db.commit()
    db.refresh(user)
    
    token = create_access_token(user.id)
    return ok({"token": token, "user_id": user.id, "name": user.name, "role": user.role})


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == payload.phone).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(400, "手机号或密码错误")
    if user.status == "disabled":
        raise HTTPException(403, "账号已禁用")
    token = create_access_token(user.id)
    return ok({"token": token, "user_id": user.id, "name": user.name, "role": user.role})


@router.put("/me")
@router.post("/me")
def update_me(payload: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = payload.email
    db.commit()
    return ok(msg="个人信息已更新")


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return ok({
        "id": user.id, "name": user.name, "phone": user.phone, "role": user.role,
        "avatar_url": user.avatar_url, "email": user.email,
        "reputation_level": user.reputation_level,
        "reputation_initiator": user.reputation_initiator,
        "reputation_executor": user.reputation_executor,
        "credit_balance": user.credit_balance,
        "contribution_balance": user.contribution_balance,
        "is_paid": user.is_paid, "invite_code": user.invite_code,
    })


@router.post("/upgrade")
def request_upgrade(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """模块9：申请付费会员升级（触发双重审核）"""
    # 检查是否已经是付费会员
    if user.is_paid:
        raise HTTPException(400, "已是付费会员")
    
    # 检查是否已有待审核的申请
    existing = db.query(AuditRecord).filter(
        AuditRecord.user_id == user.id,
        AuditRecord.type == "paid_member",
        AuditRecord.admin_status == "pending"
    ).first()
    if existing:
        return ok({"id": existing.id, "status": "pending"}, msg="已在审核中")
    
    rec = AuditRecord(user_id=user.id, type="paid_member")
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return ok({"id": rec.id, "status": "pending"}, msg="已提交，等待推荐人与管理员审核")


@router.post("/upgrade/{audit_id}/approve")
def approve_upgrade(
    audit_id: int,
    role: str = "admin",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """演示用：当事人推荐人或管理员审核通过"""
    rec = db.query(AuditRecord).filter(AuditRecord.id == audit_id).first()
    if not rec:
        raise HTTPException(404, "审核单不存在")
    
    # 获取目标用户
    target_user = db.query(User).filter(User.id == rec.user_id).first()
    if not target_user:
        raise HTTPException(404, "目标用户不存在")
    
    if role == "inviter":
        # 验证是否为推荐人
        if target_user.inviter_id != user.id:
            raise HTTPException(403, "只有推荐人可以进行推荐人审核")
        if rec.inviter_status == "approved":
            raise HTTPException(400, "推荐人已审核通过")
        rec.inviter_status = "approved"
    else:
        # 验证是否为管理员
        if user.role not in ["super_admin", "station_admin"]:
            raise HTTPException(403, "只有管理员可以进行管理员审核")
        if rec.admin_status == "approved":
            raise HTTPException(400, "管理员已审核通过")
        rec.admin_status = "approved"
    
    # 双重审核都通过则升级
    if rec.inviter_status == "approved" and rec.admin_status == "approved":
        target_user.is_paid = True
        target_user.paid_at = datetime.utcnow()
        target_user.role = "paid"
        rec.resolved_at = datetime.utcnow()
    
    db.commit()
    return ok({"inviter_status": rec.inviter_status, "admin_status": rec.admin_status})
