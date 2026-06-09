"""pytest 配置：临时 SQLite，不污染项目 qimeng.db"""
import os
import tempfile

_test_db_fd, _test_db_path = tempfile.mkstemp(suffix=".db")
os.close(_test_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

from fastapi.testclient import TestClient  # noqa: E402
import pytest  # noqa: E402

from app.database import init_db, SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.seeds.seed_data import (  # noqa: E402
    DEMO_PHONE,
    DEMO_PASSWORD,
    ensure_demo_user,
    ensure_test_friend_users,
)
from app.models.user import User  # noqa: E402
from app.models.profit import ProfitSharingRecord, ChannelRelation  # noqa: E402
from app.models.experience import ExperienceQuota  # noqa: E402
from app.models.contribution import ContributionPoint  # noqa: E402
from app.models.membership import MembershipOrder  # noqa: E402


def _reset_demo_user(db) -> None:
    """重置演示账号状态和分账数据"""
    user = db.query(User).filter(User.phone == DEMO_PHONE).first()
    if not user:
        return

    # 重置用户状态
    user.role = "normal"
    user.is_paid = False
    user.paid_at = None
    # 设置推荐人为种子用户 id=1（张一格）
    if user.inviter_id is None:
        user.inviter_id = 1

    # 清理分账相关数据（测试隔离）
    db.query(ProfitSharingRecord).filter(
        ProfitSharingRecord.income_source == "member_fee"
    ).delete(synchronize_session=False)

    db.query(ExperienceQuota).filter(
        ExperienceQuota.user_id == user.id
    ).delete(synchronize_session=False)

    db.query(ContributionPoint).filter(
        ContributionPoint.source_type == "invite_paid"
    ).delete(synchronize_session=False)

    # 重置种子用户的贡献积分余额
    seed_user = db.query(User).filter(User.id == 1).first()
    if seed_user:
        seed_user.contribution_balance = 500

    db.commit()


@pytest.fixture(scope="session")
def client():
    init_db()
    with SessionLocal() as db:
        ensure_demo_user(db)
        ensure_test_friend_users(db)
        _reset_demo_user(db)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def demo_token(client):
    r = client.post("/api/auth/login", json={"phone": DEMO_PHONE, "password": DEMO_PASSWORD})
    assert r.status_code == 200
    return r.json()["data"]["token"]


@pytest.fixture
def other_token(client):
    r = client.post(
        "/api/auth/login",
        json={"phone": "18800000001", "password": DEMO_PASSWORD},
    )
    assert r.status_code == 200
    return r.json()["data"]["token"]


@pytest.fixture
def reset_settlement(client):
    """每个测试前重置分账数据"""
    with SessionLocal() as db:
        _reset_demo_user(db)
    yield


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
