"""模块4：任务全生命周期 - V2.0 核心"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func, case

from ..database import get_db
from ..models.user import User
from ..models.task import Task, TaskParticipant, TaskAppeal
from ..models.task_delivery import TaskDelivery
from ..models.recommendation import Recommendation
from ..models.credit import CreditTransaction
from ..models.reputation import ReputationRecord
from ..models.stat import InteractionStat
from ..core.response import ok
from ..deps import get_current_user
from ..schemas.task import (
    TaskCreate, TaskReview, TaskSubmit, TaskDeliverCreate, TaskDeliveryReview, TaskAppealIn,
)
from ..services.inbox import send_inbox_message

router = APIRouter(prefix="/api/v1/tasks", tags=["tasks"])

# 信用等级到分数映射，用于权限校验
_LEVEL_MAP = {"D": 0, "C": 400, "B": 500, "A": 600, "S": 700, "SS": 800, "SSS": 900}


def _freeze_credit(db: Session, user: User, amount: int, task_id: int):
    """冻结积分（需要在事务中调用）"""
    if amount <= 0:
        return
    if user.credit_balance < amount:
        raise HTTPException(400, f"积分不足，需要 {amount}，当前 {user.credit_balance}")
    before = user.credit_balance
    user.credit_balance -= amount
    db.add(CreditTransaction(
        user_id=user.id, type="freeze", amount=-amount,
        balance_before=before, balance_after=user.credit_balance,
        related_task_id=task_id, note="任务发布冻结"
    ))


def _task_paid_gross(db: Session, task_id: int) -> int:
    """该任务托管池已兑付累计（gross，未扣手续费前的 paid_credit 之和）"""
    total = (
        db.query(func.coalesce(func.sum(TaskParticipant.paid_credit), 0))
        .filter(
            TaskParticipant.task_id == task_id,
            TaskParticipant.status == "reviewed",
        )
        .scalar()
    )
    return int(total or 0)


def _calculate_pay_ratio(satisfaction: int, ratio_map: dict) -> int:
    """根据满意度计算兑付比例"""
    ratio_map = ratio_map or {"90": 110, "80": 100, "60": 80, "0": 30}
    pay_ratio = 0
    for threshold, r in sorted(ratio_map.items(), key=lambda x: -int(x[0])):
        if satisfaction >= int(threshold):
            pay_ratio = r
            break
    return pay_ratio


def _update_reputation_level(user: User):
    """更新用户信用等级"""
    score = user.reputation_executor
    for lv, mn in [("SSS", 900), ("SS", 800), ("S", 700), ("A", 600),
                   ("B", 500), ("C", 400), ("D", 0)]:
        if score >= mn:
            user.reputation_level = lv
            break


_JOINED_PARTICIPANT_STATUSES = ("accepted", "submitted", "reviewed")
_DELIVERY_REP_BONUS = 20


def _get_task_or_404(db: Session, task_id: int) -> Task:
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "任务不存在")
    return t


def _get_joined_participant(db: Session, task_id: int, user_id: int) -> TaskParticipant:
    p = db.query(TaskParticipant).filter(
        TaskParticipant.task_id == task_id,
        TaskParticipant.user_id == user_id,
        TaskParticipant.status.in_(_JOINED_PARTICIPANT_STATUSES),
    ).first()
    if not p:
        raise HTTPException(403, "仅已录用/参与中的执行方可提交交付")
    return p


def _serialize_delivery(d: TaskDelivery, executor_name: str = "") -> dict:
    return {
        "id": d.id,
        "task_id": d.task_id,
        "executor_id": d.executor_id,
        "executor_name": executor_name,
        "content": d.content or "",
        "attachments": d.attachments_list(),
        "status": d.status,
        "reject_reason": d.reject_reason,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
    }


@router.post("/")
def create_task(payload: TaskCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发布任务（冻结积分至托管）"""
    t = Task(host_id=user.id, **payload.model_dump())
    db.add(t)
    db.flush()
    if t.total_credit_pool > 0:
        _freeze_credit(db, user, t.total_credit_pool, t.id)
        t.credit_frozen = True
    db.commit()
    db.refresh(t)
    return ok({"id": t.id, "title": t.title, "credit_frozen": t.credit_frozen})


@router.get("/")
def list_tasks(category: str = "全部", status: str = "全部", page: int = 1, page_size: int = 20,
               db: Session = Depends(get_db)):
    """任务列表（优化 N+1 查询）"""
    q = db.query(Task)
    if category != "全部":
        q = q.filter(Task.category == category)
    if status != "全部":
        q = q.filter(Task.status == status)
    
    # 获取总数
    total = q.count()

    now = datetime.utcnow()
    active_rec_task_ids = (
        db.query(Recommendation.target_id)
        .filter(
            Recommendation.target_type == "task",
            Recommendation.expire_at > now,
        )
        .distinct()
    )
    is_recommended_expr = case(
        (Task.id.in_(active_rec_task_ids), 1),
        else_=0,
    )

    # 查询任务并预加载 host 用户；未过期推荐位优先，再按发布时间
    tasks = (
        q.options(joinedload(Task.host))
        .order_by(is_recommended_expr.desc(), Task.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 批量获取报名数
    task_ids = [t.id for t in tasks]
    recommended_ids = set()
    if task_ids:
        recommended_ids = {
            row[0]
            for row in db.query(Recommendation.target_id)
            .filter(
                Recommendation.target_type == "task",
                Recommendation.target_id.in_(task_ids),
                Recommendation.expire_at > now,
            )
            .distinct()
            .all()
        }
    participant_counts = {}
    if task_ids:
        counts = (
            db.query(
                TaskParticipant.task_id,
                func.count(TaskParticipant.id).label("count")
            )
            .filter(TaskParticipant.task_id.in_(task_ids))
            .group_by(TaskParticipant.task_id)
            .all()
        )
        participant_counts = {task_id: cnt for task_id, cnt in counts}
    
    items = []
    for t in tasks:
        host = t.host
        applied = participant_counts.get(t.id, 0)
        items.append({
            "id": t.id, "title": t.title, "category": t.category,
            "description": t.description, "host_id": t.host_id,
            "host_name": host.name if host else "",
            "host_level": host.reputation_level if host else "A",
            "total_quota": t.total_quota, "applied": applied,
            "base_credit_per_person": t.base_credit_per_person,
            "min_reputation_level": t.min_reputation_level,
            "status": t.status, "completed_at": t.completed_at,
            "deliver_deadline": t.deliver_deadline,
            "tags": t.required_tags,
            "is_recommended": t.id in recommended_ids,
        })
    return ok({"items": items, "total": total})


@router.get("/my")
def my_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    posted = db.query(Task).filter(Task.host_id == user.id).all()
    joined = db.query(TaskParticipant).filter(TaskParticipant.user_id == user.id).all()
    return ok({
        "posted": [{"id": t.id, "title": t.title, "status": t.status, "pool": t.total_credit_pool} for t in posted],
        "joined": [{"id": p.task_id, "status": p.status, "satisfaction": p.satisfaction, "paid": p.paid_credit} for p in joined],
    })


@router.patch("/{task_id}/complete")
def complete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """发布方确认任务完成（不可撤销）"""
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.host_id != user.id:
        raise HTTPException(403, "仅发布方可确认完成")
    if t.status == "completed":
        raise HTTPException(400, "任务已完成")
    now = datetime.utcnow()
    t.status = "completed"
    t.completed_at = now
    db.commit()
    return ok({"id": t.id, "status": t.status, "completed_at": now.isoformat()}, msg="任务已标记为完成")


@router.get("/{task_id}")
def task_detail(task_id: int, db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "任务不存在")
    parts = db.query(TaskParticipant).filter(TaskParticipant.task_id == task_id).all()
    return ok({
        "id": t.id, "title": t.title, "description": t.description, "category": t.category,
        "host_id": t.host_id, "total_quota": t.total_quota,
        "base_credit_per_person": t.base_credit_per_person,
        "total_credit_pool": t.total_credit_pool,
        "qualified_threshold": t.qualified_threshold,
        "extra_credit_rules": t.extra_credit_rules,
        "satisfaction_ratio_map": t.satisfaction_ratio_map,
        "min_reputation_level": t.min_reputation_level,
        "appeal_rules": t.appeal_rules, "status": t.status,
        "deliver_deadline": t.deliver_deadline,
        "participants": [{
            "id": p.id, "user_id": p.user_id, "status": p.status,
            "satisfaction": p.satisfaction, "paid_credit": p.paid_credit,
        } for p in parts],
    })


@router.post("/{task_id}/join")
def join_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id).first()
    if not t:
        raise HTTPException(404, "任务不存在")
    if t.status != "open":
        raise HTTPException(400, "任务已关闭")
    # 信用门槛
    need = _LEVEL_MAP.get(t.min_reputation_level, 500)
    if user.reputation_executor < need:
        raise HTTPException(403, f"接单方信用分需≥{need}，当前{user.reputation_executor}")
    if db.query(TaskParticipant).filter(TaskParticipant.task_id == task_id,
                                        TaskParticipant.user_id == user.id).first():
        return ok(msg="已报名")
    db.add(TaskParticipant(task_id=task_id, user_id=user.id, status="applied"))
    db.commit()
    try:
        if t.host_id and t.host_id != user.id:
            send_inbox_message(
                db,
                from_user_id=user.id,
                to_user_id=t.host_id,
                type="task_notify",
                title="有人申请承接你的任务",
                content=f"{user.name} 申请承接《{t.title}》",
                related_id=t.id,
            )
            db.commit()
    except Exception:
        db.rollback()
    return ok(msg="报名成功")


@router.post("/{task_id}/accept/{participant_id}")
def accept_participant(task_id: int, participant_id: int,
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id, Task.host_id == user.id).first()
    if not t:
        raise HTTPException(403, "无权限")
    p = db.query(TaskParticipant).filter(TaskParticipant.id == participant_id, TaskParticipant.task_id == task_id).first()
    if not p:
        raise HTTPException(404, "报名不存在")
    p.status = "accepted"
    p.accepted_at = datetime.utcnow()
    t.status = "in_progress"
    db.commit()
    return ok(msg="已录用")


@router.post("/{task_id}/submit")
def submit_task(task_id: int, payload: TaskSubmit,
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(TaskParticipant).filter(TaskParticipant.task_id == task_id,
                                         TaskParticipant.user_id == user.id).first()
    if not p:
        raise HTTPException(404, "未报名")
    p.submission = payload.submission
    p.status = "submitted"
    p.submitted_at = datetime.utcnow()
    db.commit()
    return ok(msg="已交付，等待验收")


@router.post("/{task_id}/review")
def review(task_id: int, payload: TaskReview,
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """V2.0 标准化加权评价 + 自动兑付"""
    t = db.query(Task).filter(Task.id == task_id, Task.host_id == user.id).first()
    if not t:
        raise HTTPException(403, "无权限")
    p = db.query(TaskParticipant).filter(TaskParticipant.id == payload.participant_id, TaskParticipant.task_id == task_id).first()
    if not p:
        raise HTTPException(404, "报名不存在")

    # 4 维度加权 40/30/20/10
    sat = (payload.score_performance * 40 + payload.score_quality * 30 +
           payload.score_professional * 20 + payload.score_compliance * 10) // 100
    p.score_performance = payload.score_performance
    p.score_quality = payload.score_quality
    p.score_professional = payload.score_professional
    p.score_compliance = payload.score_compliance
    p.satisfaction = sat
    p.reviewed_at = datetime.utcnow()
    p.status = "reviewed"

    # 兑付比例 → gross（应付，未扣手续费）
    pay_ratio = _calculate_pay_ratio(sat, t.satisfaction_ratio_map)
    p.pay_ratio = pay_ratio
    gross = int(t.base_credit_per_person * pay_ratio / 100) if t.base_credit_per_person else 0

    # 已兑付累计 + 本次 gross 不得超过托管池 total_credit_pool
    paid_so_far = _task_paid_gross(db, t.id)
    if paid_so_far + gross > (t.total_credit_pool or 0):
        raise HTTPException(400, "超出任务托管池")

    p.paid_credit = gross

    executor = db.query(User).filter(User.id == p.user_id).first()
    if not executor:
        raise HTTPException(404, "接单人不存在")

    host = db.query(User).filter(User.id == t.host_id).first()
    if not host:
        raise HTTPException(404, "发布者不存在")

    if gross > 0:
        # fee = gross * 5%，net = gross - fee
        fee = int(gross * 0.05)
        net = gross - fee

        exec_before = executor.credit_balance
        executor.credit_balance += net
        db.add(CreditTransaction(
            user_id=executor.id, type="task_reward", amount=net,
            balance_before=exec_before, balance_after=executor.credit_balance,
            related_task_id=t.id, related_user_id=host.id,
            fee=fee, fee_rate=50,
            note=f"任务{t.id}兑付（满意度{sat}）",
        ))

        # 托管池出账留痕（发布时已从 host 余额扣除，此处 balance 不变）
        host_bal = host.credit_balance
        db.add(CreditTransaction(
            user_id=host.id, type="escrow_payout", amount=-gross,
            balance_before=host_bal, balance_after=host_bal,
            related_task_id=t.id, related_user_id=executor.id,
            note=f"任务{t.id}托管池兑付",
        ))

        platform_user = db.query(User).order_by(User.id).first()
        if fee > 0 and platform_user:
            plat_before = platform_user.credit_balance
            platform_user.credit_balance += fee
            db.add(CreditTransaction(
                user_id=platform_user.id, type="platform_fee", amount=fee,
                balance_before=plat_before, balance_after=platform_user.credit_balance,
                related_task_id=t.id, related_user_id=executor.id,
                note=f"任务{t.id}兑付手续费",
            ))

    # 更新信用分（满意度高加分）
    delta = (sat - 60) // 2  # 范围 -30 ~ +20
    executor.reputation_executor = max(0, min(1000, executor.reputation_executor + delta))
    db.add(ReputationRecord(
        user_id=executor.id, role_type="executor",
        dimension="交付质量", weight=30, delta=delta,
        task_id=t.id, evaluator_id=user.id,
        detail={"满意度": sat, "兑付比例": pay_ratio}
    ))

    # 更新等级
    _update_reputation_level(executor)

    # 任务合作互动统计
    for u_id, o_id in [(user.id, executor.id), (executor.id, user.id)]:
        s = db.query(InteractionStat).filter(InteractionStat.user_id == u_id,
                                             InteractionStat.other_id == o_id).first()
        if not s:
            s = InteractionStat(user_id=u_id, other_id=o_id, task_coop_count=0)
            db.add(s)
        s.task_coop_count = (s.task_coop_count or 0) + 1
        s.last_at = datetime.utcnow()

    # 看是否任务完成
    remaining = db.query(TaskParticipant).filter(
        TaskParticipant.task_id == t.id,
        TaskParticipant.status.in_(["applied", "accepted", "submitted"])
    ).count()
    if remaining == 0:
        t.status = "completed"
        t.completed_at = datetime.utcnow()
        # 托管池剩余退回 host：total_credit_pool - 已兑付 gross 累计
        if t.credit_frozen and (t.total_credit_pool or 0) > 0:
            paid_total = _task_paid_gross(db, t.id)
            leftover = (t.total_credit_pool or 0) - paid_total
            if leftover > 0:
                refund_before = host.credit_balance
                host.credit_balance += leftover
                db.add(CreditTransaction(
                    user_id=host.id, type="escrow_refund", amount=leftover,
                    balance_before=refund_before, balance_after=host.credit_balance,
                    related_task_id=t.id, note=f"任务{t.id}托管池退回",
                ))
            t.credit_frozen = False

    db.commit()
    return ok({"satisfaction": sat, "pay_ratio": pay_ratio, "paid_credit": gross})


@router.post("/{task_id}/deliver")
def deliver_task(
    task_id: int,
    payload: TaskDeliverCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """执行方提交交付成果（任务须为进行中）"""
    t = _get_task_or_404(db, task_id)
    if t.status != "in_progress":
        raise HTTPException(400, "仅进行中的任务可提交交付")
    _get_joined_participant(db, task_id, user.id)

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(400, "请填写交付内容")

    pending = db.query(TaskDelivery).filter(
        TaskDelivery.task_id == task_id,
        TaskDelivery.executor_id == user.id,
        TaskDelivery.status == "pending",
    ).first()
    if pending:
        raise HTTPException(400, "已有待审核的交付记录，请等待发布方处理")

    delivery = TaskDelivery(
        task_id=task_id,
        executor_id=user.id,
        content=content,
        status="pending",
    )
    delivery.set_attachments(payload.attachments)
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    return ok(
        {"delivery_id": delivery.id, "status": delivery.status},
        msg="交付已提交，等待发布方验收",
    )


@router.get("/{task_id}/deliveries")
def list_task_deliveries(
    task_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发布方或执行方查看任务全部交付记录"""
    t = _get_task_or_404(db, task_id)
    is_host = t.host_id == user.id
    is_executor = db.query(TaskParticipant).filter(
        TaskParticipant.task_id == task_id,
        TaskParticipant.user_id == user.id,
        TaskParticipant.status.in_(_JOINED_PARTICIPANT_STATUSES),
    ).first() is not None
    if not is_host and not is_executor:
        raise HTTPException(403, "仅发布方或任务执行方可查看交付记录")

    rows = (
        db.query(TaskDelivery, User.name)
        .outerjoin(User, User.id == TaskDelivery.executor_id)
        .filter(TaskDelivery.task_id == task_id)
        .order_by(TaskDelivery.created_at.desc())
        .all()
    )
    items = [_serialize_delivery(d, name or "") for d, name in rows]
    return ok({"items": items, "total": len(items)})


@router.post("/{task_id}/deliveries/{delivery_id}/review")
def review_task_delivery(
    task_id: int,
    delivery_id: int,
    payload: TaskDeliveryReview,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """发布方审核交付：通过则完成任务并为执行方加信用分"""
    t = _get_task_or_404(db, task_id)
    if t.host_id != user.id:
        raise HTTPException(403, "仅发布方可审核交付")

    action = (payload.action or "").strip().lower()
    if action not in ("approve", "reject"):
        raise HTTPException(400, "action 须为 approve 或 reject")

    delivery = db.query(TaskDelivery).filter(
        TaskDelivery.id == delivery_id,
        TaskDelivery.task_id == task_id,
    ).first()
    if not delivery:
        raise HTTPException(404, "交付记录不存在")
    if delivery.status != "pending":
        raise HTTPException(400, f"该交付已处理（{delivery.status}）")

    now = datetime.utcnow()
    delivery.reviewed_at = now

    if action == "reject":
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(400, "驳回时请填写 reason")
        delivery.status = "rejected"
        delivery.reject_reason = reason
        db.commit()
        db.refresh(t)
        return ok(
            {"action": "reject", "task_status": t.status, "delivery_id": delivery.id},
            msg="已驳回交付，任务仍为进行中",
        )

    executor = db.query(User).filter(User.id == delivery.executor_id).first()
    if not executor:
        raise HTTPException(404, "执行方用户不存在")

    delivery.status = "approved"
    delivery.reject_reason = None

    before_score = executor.reputation_executor
    executor.reputation_executor = min(1000, before_score + _DELIVERY_REP_BONUS)
    actual_delta = executor.reputation_executor - before_score
    db.add(ReputationRecord(
        user_id=executor.id,
        role_type="executor",
        dimension="交付验收",
        weight=100,
        delta=actual_delta,
        task_id=t.id,
        evaluator_id=user.id,
        detail={"delivery_id": delivery.id, "action": "approve", "bonus": _DELIVERY_REP_BONUS},
    ))
    _update_reputation_level(executor)

    participant = db.query(TaskParticipant).filter(
        TaskParticipant.task_id == task_id,
        TaskParticipant.user_id == delivery.executor_id,
    ).first()
    if participant and participant.status in ("accepted", "submitted"):
        participant.status = "reviewed"
        participant.reviewed_at = now
        if not participant.submitted_at:
            participant.submitted_at = delivery.created_at or now

    t.status = "completed"
    t.completed_at = now

    db.commit()
    db.refresh(t)
    return ok(
        {
            "action": "approve",
            "task_status": t.status,
            "delivery_id": delivery.id,
            "reputation_delta": actual_delta,
            "executor_reputation": executor.reputation_executor,
        },
        msg="验收通过，任务已完成",
    )


@router.post("/{task_id}/appeal")
def appeal_task(
    task_id: int,
    payload: TaskAppealIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    t = _get_task_or_404(db, task_id)
    other = t.host_id if t.host_id != user.id else 0
    if other == 0:
        raise HTTPException(400, "无法申诉自己的任务")
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(400, "请填写申诉理由")
    a = TaskAppeal(
        task_id=task_id,
        appellant_id=user.id,
        respondent_id=other,
        reason=reason,
        status="pending",
    )
    db.add(a)
    db.commit()
    return ok(msg="申诉已提交")
