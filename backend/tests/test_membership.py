"""会员订单 API 测试"""
from tests.conftest import auth_headers

from app.database import SessionLocal
from app.seeds.seed_data import DEMO_PHONE
from app.models.user import User


def test_create_basic_order(client, demo_token):
    r = client.post(
        "/api/v1/membership/orders",
        json={"tier": "basic"},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["tier"] == "basic"
    assert data["amount"] == 1_000_000
    assert data["status"] == "pending"


def test_create_invalid_tier(client, demo_token):
    r = client.post(
        "/api/v1/membership/orders",
        json={"tier": "invalid"},
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 400


def test_list_my_orders(client, demo_token):
    created = client.post(
        "/api/v1/membership/orders",
        json={"tier": "pro"},
        headers=auth_headers(demo_token),
    )
    assert created.status_code == 200
    order_id = created.json()["data"]["id"]

    r = client.get(
        "/api/v1/membership/orders/my",
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert any(i["id"] == order_id and i["tier"] == "pro" for i in items)


def test_mock_pay_success(client, demo_token):
    created = client.post(
        "/api/v1/membership/orders",
        json={"tier": "basic"},
        headers=auth_headers(demo_token),
    )
    order_id = created.json()["data"]["id"]

    r = client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(demo_token),
    )
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "paid"
    assert r.json()["data"]["paid_at"] is not None


def test_user_becomes_paid(client, demo_token):
    with SessionLocal() as db:
        user = db.query(User).filter(User.phone == DEMO_PHONE).first()
        user.role = "normal"
        user.is_paid = False
        user.paid_at = None
        db.commit()

    created = client.post(
        "/api/v1/membership/orders",
        json={"tier": "basic"},
        headers=auth_headers(demo_token),
    )
    order_id = created.json()["data"]["id"]
    client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(demo_token),
    )

    me = client.get("/api/auth/me", headers=auth_headers(demo_token))
    assert me.status_code == 200
    assert me.json()["data"]["is_paid"] is True
    assert me.json()["data"]["role"] == "paid"


def test_double_pay_fails(client, demo_token):
    created = client.post(
        "/api/v1/membership/orders",
        json={"tier": "basic"},
        headers=auth_headers(demo_token),
    )
    order_id = created.json()["data"]["id"]
    first = client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(demo_token),
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(demo_token),
    )
    assert second.status_code == 400


def test_others_cannot_pay(client, demo_token, other_token):
    created = client.post(
        "/api/v1/membership/orders",
        json={"tier": "basic"},
        headers=auth_headers(demo_token),
    )
    order_id = created.json()["data"]["id"]

    r = client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(other_token),
    )
    assert r.status_code == 403
