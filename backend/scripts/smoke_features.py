#!/usr/bin/env python3
"""Smoke test for recently implemented features."""
import sys
sys.path.insert(0, ".")

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, init_db
from app.models.user import User
from app.models.task import Task
from app.models.activity import Activity, ActivityCheckin
from app.core.security import create_access_token

init_db()
client = TestClient(app)
db = SessionLocal()

u = db.query(User).filter(User.status == "active").first()
if not u:
    print("SKIP: no active user in DB")
    sys.exit(0)

u2 = db.query(User).filter(User.status == "active", User.id != u.id).first()
token = create_access_token(u.id)
H = {"Authorization": "Bearer " + token}

results = []


def check(name, cond, detail=""):
    results.append((name, cond, detail))


# Global search
r = client.get("/api/v1/search", params={"q": "会"}, headers=H)
d = r.json().get("data") or {}
check("全局搜索 /api/v1/search", r.status_code == 200 and "users" in d and "tasks" in d and "activities" in d)

# Inbox
r = client.get("/api/v1/inbox/unread-count", headers=H)
check("站内信 unread-count", r.status_code == 200 and "count" in (r.json().get("data") or {}))

if u2:
    from app.models.friend import FriendRelation
    has_rel = db.query(FriendRelation).filter(
        FriendRelation.user_id == u.id,
        FriendRelation.friend_id == u2.id,
    ).first()
    if not has_rel:
        db.add(FriendRelation(user_id=u.id, friend_id=u2.id, scene="smoke"))
        db.add(FriendRelation(user_id=u2.id, friend_id=u.id, scene="smoke"))
        db.commit()
    r = client.post(
        "/api/v1/inbox/share-card",
        json={"card_user_id": u2.id, "to_user_ids": [u2.id]},
        headers=H,
    )
    check("名片转发 share-card", r.status_code == 200 and (r.json().get("data") or {}).get("sent") == 1)
    token2 = create_access_token(u2.id)
    r2 = client.get("/api/v1/inbox/list", headers={"Authorization": "Bearer " + token2})
    items2 = (r2.json().get("data") or {}).get("items") or []
    card_msgs = [m for m in items2 if m.get("type") == "card_share" and m.get("related_id") == u2.id]
    check("名片转发收件箱", r2.status_code == 200 and len(card_msgs) >= 1, f"n={len(card_msgs)}")
else:
    check("名片转发 share-card", True, "skip no second user")

# Activity circle
r = client.get("/api/v1/users/activity-circle", headers=H)
check("活动圈 activity-circle", r.status_code == 200 and "items" in (r.json().get("data") or {}))

# Spaces type + keyword
r = client.get("/api/spaces/", params={"type": "会议室"})
items = (r.json().get("data") or {}).get("items") or []
type_ok = all(i.get("type") == "会议室" for i in items) if items else True
check("空间类型筛选", r.status_code == 200 and type_ok, f"n={len(items)}")

r = client.get("/api/spaces/", params={"keyword": "北外滩"})
check("空间关键词搜索", r.status_code == 200)

# Task complete + 403 for non-host
t = Task(host_id=u.id, title="__smoke_complete__", status="in_progress")
db.add(t)
db.commit()
db.refresh(t)
tid = t.id
r = client.patch(f"/api/v1/tasks/{tid}/complete", headers=H)
db.expire_all()
t_done = db.query(Task).filter(Task.id == tid).first()
check(
    "任务确认完成(发布方)",
    r.status_code == 200 and t_done and t_done.status == "completed",
    f"http={r.status_code} status={getattr(t_done, 'status', None)}",
)

if u2:
    token2 = create_access_token(u2.id)
    r403 = client.patch(f"/api/v1/tasks/{tid}/complete", headers={"Authorization": "Bearer " + token2})
    check("任务完成仅发布方", r403.status_code == 403)
else:
    check("任务完成仅发布方", True, "skip no second user")

db.delete(t_done)
db.commit()

# Activity checkin + attendees
act = db.query(Activity).first()
if act and u2:
    for uid in (u.id, u2.id):
        if not db.query(ActivityCheckin).filter(
            ActivityCheckin.activity_id == act.id, ActivityCheckin.user_id == uid
        ).first():
            db.add(ActivityCheckin(activity_id=act.id, user_id=uid))
    db.commit()
    ck = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == act.id, ActivityCheckin.user_id == u.id
    ).first()
    ck.checked_in_at = None
    db.commit()
    r = client.post(f"/api/v1/activities/{act.id}/checkin", headers=H)
    check("活动签到", r.status_code == 200)
    r403 = client.get(f"/api/v1/activities/{act.id}/attendees", headers={"Authorization": f"Bearer {create_access_token(u2.id)}"})
    # u2 not checked in -> 403
    ck2 = db.query(ActivityCheckin).filter(
        ActivityCheckin.activity_id == act.id, ActivityCheckin.user_id == u2.id
    ).first()
    if ck2 and not ck2.checked_in_at:
        check("到场列表仅签到可访问", r403.status_code == 403)
    else:
        check("到场列表仅签到可访问", True, "skip u2 checked in")
    r_att = client.get(f"/api/v1/activities/{act.id}/attendees", headers=H)
    att = r_att.json().get("data") or {}
    check("到场人员列表", r_att.status_code == 200 and "items" in att)
else:
    check("活动签到", True, "skip no activity/second user")
    check("到场列表仅签到可访问", True, "skip")
    check("到场人员列表", True, "skip")

db.close()

print("\n=== 功能冒烟测试结果 ===\n")
passed = failed = 0
for name, ok, detail in results:
    status = "✓" if ok else "✗"
    if ok:
        passed += 1
    else:
        failed += 1
    extra = f" ({detail})" if detail else ""
    print(f"  {status} {name}{extra}")

print(f"\n通过 {passed}/{passed+failed}")
sys.exit(1 if failed else 0)
