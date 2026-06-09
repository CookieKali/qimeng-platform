"""贡献积分消耗 API 测试"""
from tests.conftest import auth_headers, SessionLocal

from app.seeds.seed_data import DEMO_PHONE
from app.models.user import User
from app.models.task import Task
from app.models.contribution import ContributionPoint
from app.models.recommendation import Recommendation
from app.models.reputation import ReputationRecord


def _demo_user(db):
    return db.query(User).filter(User.phone == DEMO_PHONE).first()


def _fund_user(db, balance: int):
    u = _demo_user(db)
    u.contribution_balance = balance
    db.commit()
    return u


def _ensure_task(db):
    t = db.query(Task).first()
    if t:
        return t.id
    host = _demo_user(db)
    t = Task(
        host_id=host.id,
        title="消耗测试任务",
        category="测试",
        total_quota=1,
        total_credit_pool=0,
        base_credit_per_person=0,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t.id


def test_consume_traffic_boost(client, demo_token):
    with SessionLocal() as db:
        _fund_user(db, 2000)
        task_id = _ensure_task(db)
        u = _demo_user(db)
        bal_before = u.contribution_balance
        rec_before = db.query(Recommendation).filter(Recommendation.user_id == u.id).count()

    r = client.post(
        "/api/v1/contribution/consume",
        json={"scene": "traffic_boost", "target_type": "task", "target_id": task_id},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["cost"] == 500
    assert data["balance_after"] == bal_before - 500
    assert data["effect"]["recommendation_id"]

    with SessionLocal() as db:
        u = _demo_user(db)
        assert u.contribution_balance == bal_before - 500
        assert db.query(Recommendation).filter(Recommendation.user_id == u.id).count() == rec_before + 1
        row = db.query(ContributionPoint).filter(
            ContributionPoint.user_id == u.id,
            ContributionPoint.source_type == "consume_traffic_boost",
        ).order_by(ContributionPoint.id.desc()).first()
        assert row is not None and row.amount == -500


def test_consume_credit_accel(client, demo_token):
    with SessionLocal() as db:
        _fund_user(db, 2000)
        u = _demo_user(db)
        rep_before = u.reputation_executor
        bal_before = u.contribution_balance

    r = client.post(
        "/api/v1/contribution/consume",
        json={"scene": "credit_accel"},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["cost"] == 200
    assert data["effect"]["delta"] == 10

    with SessionLocal() as db:
        u = _demo_user(db)
        assert u.contribution_balance == bal_before - 200
        assert u.reputation_executor == min(1000, rep_before + 10)
        rec = db.query(ReputationRecord).filter(
            ReputationRecord.user_id == u.id,
            ReputationRecord.dimension == "积分加速",
        ).order_by(ReputationRecord.id.desc()).first()
        assert rec is not None and rec.delta == 10


def test_consume_perk(client, demo_token):
    with SessionLocal() as db:
        _fund_user(db, 3000)
        u = _demo_user(db)
        bal_before = u.contribution_balance

    r = client.post(
        "/api/v1/contribution/consume",
        json={"scene": "perk"},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    assert r.json()["data"]["cost"] == 1000
    assert r.json()["data"]["balance_after"] == bal_before - 1000

    with SessionLocal() as db:
        row = db.query(ContributionPoint).filter(
            ContributionPoint.user_id == _demo_user(db).id,
            ContributionPoint.source_type == "consume_perk",
        ).order_by(ContributionPoint.id.desc()).first()
        assert row is not None and row.amount == -1000


def test_consume_insufficient(client, demo_token):
    with SessionLocal() as db:
        _fund_user(db, 100)

    r = client.post(
        "/api/v1/contribution/consume",
        json={"scene": "perk"},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 400
    assert "贡献积分不足" in (r.json().get("detail") or "")
