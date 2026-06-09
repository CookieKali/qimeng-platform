"""分账逻辑测试 - 验证金额守恒"""
from sqlalchemy import func

from tests.conftest import auth_headers

from app.database import SessionLocal
from app.models.profit import ProfitSharingRecord
from app.models.experience import ExperienceQuota
from app.models.contribution import ContributionPoint
from app.models.user import User
from app.seeds.seed_data import DEMO_PHONE
from app.core.contribution import _multiplier


def _expected_contribution(base: int, reputation_level: str) -> int:
    return int(base * _multiplier(reputation_level or ""))


def _get_user(db, phone):
    return db.query(User).filter(User.phone == phone).first()


def _create_and_pay_order(client, token, tier):
    """创建并支付订单"""
    r = client.post(
        "/api/v1/membership/orders",
        json={"tier": tier},
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    order_id = r.json()["data"]["id"]

    r = client.post(
        f"/api/v1/membership/orders/{order_id}/mock-pay",
        headers=auth_headers(token),
    )
    assert r.status_code == 200
    return r.json()["data"]


def test_settle_sum_equals_amount(client, demo_token, reset_settlement):
    """测试：有推荐人的买家付 basic，4路cash + 体验额度 = 1000000"""
    with SessionLocal() as db:
        buyer = _get_user(db, DEMO_PHONE)
        referrer_id = buyer.inviter_id
        assert referrer_id is not None, "演示账号应有推荐人"

        r = client.post(
            "/api/v1/membership/orders",
            json={"tier": "basic"},
            headers=auth_headers(demo_token),
        )
        assert r.status_code == 200
        order_amount = r.json()["data"]["amount"]

        client.post(
            f"/api/v1/membership/orders/{r.json()['data']['id']}/mock-pay",
            headers=auth_headers(demo_token),
        )

        cash_sum = db.query(ProfitSharingRecord).filter(
            ProfitSharingRecord.income_source == "member_fee"
        ).with_entities(
            func.sum(ProfitSharingRecord.amount)
        ).scalar() or 0

        quota = db.query(ExperienceQuota).filter(
            ExperienceQuota.user_id == buyer.id
        ).first()
        experience_total = quota.total if quota else 0

        total_distributed = float(cash_sum) + float(experience_total)

        assert total_distributed == order_amount == 1_000_000, (
            f"守恒失败: 4路cash({cash_sum}) + 体验额度({experience_total}) = {total_distributed}, "
            f"期望 1000000"
        )


def test_referrer_gets_200_contribution(client, demo_token, reset_settlement):
    """测试：推荐人获得 200 贡献积分，contribution_balance 增加"""
    with SessionLocal() as db:
        buyer = _get_user(db, DEMO_PHONE)
        referrer_id = buyer.inviter_id
        assert referrer_id is not None, "演示账号应有推荐人"

        referrer = db.query(User).filter(User.id == referrer_id).first()
        assert referrer is not None, "推荐人应存在"
        contrib_before = referrer.contribution_balance

        invite_paid_count_before = db.query(ContributionPoint).filter(
            ContributionPoint.user_id == referrer_id,
            ContributionPoint.source_type == "invite_paid"
        ).count()

        _create_and_pay_order(client, demo_token, "basic")

        invite_paid_count_after = db.query(ContributionPoint).filter(
            ContributionPoint.user_id == referrer_id,
            ContributionPoint.source_type == "invite_paid"
        ).count()

        db.expire(referrer)
        referrer_after = db.query(User).filter(User.id == referrer_id).first()
        contrib_after = referrer_after.contribution_balance

        assert invite_paid_count_after == invite_paid_count_before + 1, (
            f"推荐人 invite_paid 记录应增加1条"
        )

        expected = _expected_contribution(200, referrer.reputation_level)
        assert contrib_after == contrib_before + expected, (
            f"推荐人 contribution_balance 应增加{expected} "
            f"(基础200×{referrer.reputation_level}加成): "
            f"之前={contrib_before}, 之后={contrib_after}"
        )
        paid_row = db.query(ContributionPoint).filter(
            ContributionPoint.user_id == referrer_id,
            ContributionPoint.source_type == "invite_paid",
        ).order_by(ContributionPoint.id.desc()).first()
        assert paid_row is not None and paid_row.amount == expected


def test_experience_quota_360(client, demo_token, reset_settlement):
    """测试：买家 ExperienceQuota.total == 360000"""
    with SessionLocal() as db:
        buyer = _get_user(db, DEMO_PHONE)
        buyer_id = buyer.id

        _create_and_pay_order(client, demo_token, "basic")

        quota = db.query(ExperienceQuota).filter(
            ExperienceQuota.user_id == buyer_id
        ).first()

        assert quota is not None, "买家应有体验额度记录"
        assert quota.total == 360_000, (
            f"体验额度应为 360000, 实际 {quota.total}"
        )
        assert quota.used == 0, "体验额度未使用时应为0"


def test_no_referrer_goes_to_platform(client, reset_settlement):
    """测试：无推荐人时，总额仍守恒（200‰ 并入平台），且无 invite_paid 记录"""
    with SessionLocal() as db:
        r = client.post(
            "/api/auth/register",
            json={
                "phone": "19999990002",
                "password": "test123456",
                "name": "无推荐人测试",
                "invite_code": "",
            },
        )
        assert r.status_code == 200
        new_user_id = r.json()["data"]["user_id"]
        new_token = r.json()["data"]["token"]

        new_user = db.query(User).filter(User.id == new_user_id).first()
        assert new_user.inviter_id is None, "新用户应无推荐人"

        order_amount = 1_000_000

        cash_sum_before = db.query(ProfitSharingRecord).filter(
            ProfitSharingRecord.income_source == "member_fee"
        ).with_entities(
            func.sum(ProfitSharingRecord.amount)
        ).scalar() or 0

        _create_and_pay_order(client, new_token, "basic")

        cash_sum_after = db.query(ProfitSharingRecord).filter(
            ProfitSharingRecord.income_source == "member_fee"
        ).with_entities(
            func.sum(ProfitSharingRecord.amount)
        ).scalar() or 0

        cash_increase = cash_sum_after - cash_sum_before

        quota = db.query(ExperienceQuota).filter(
            ExperienceQuota.user_id == new_user_id
        ).first()
        experience_total = quota.total if quota else 0

        total_distributed = cash_increase + experience_total

        assert total_distributed == order_amount == 1_000_000, (
            f"无推荐人守恒失败: 4路cash增加({cash_increase}) + 体验额度({experience_total}) "
            f"= {total_distributed}, 期望 1000000"
        )

        invite_paid_count = db.query(ContributionPoint).filter(
            ContributionPoint.source_type == "invite_paid"
        ).count()
        assert invite_paid_count == 0, (
            f"无推荐人时不应有 invite_paid 记录, 实际 {invite_paid_count} 条"
        )


def test_pro_tier_scales(client, demo_token, reset_settlement):
    """测试：付 pro(3000000)，断言守恒（4路+额度==3000000）"""
    with SessionLocal() as db:
        buyer = _get_user(db, DEMO_PHONE)
        referrer_id = buyer.inviter_id

        order_amount = 3_000_000

        cash_sum_before = db.query(ProfitSharingRecord).filter(
            ProfitSharingRecord.income_source == "member_fee"
        ).with_entities(
            func.sum(ProfitSharingRecord.amount)
        ).scalar() or 0

        quota_before = db.query(ExperienceQuota).filter(
            ExperienceQuota.user_id == buyer.id
        ).first()
        quota_before_total = quota_before.total if quota_before else 0

        _create_and_pay_order(client, demo_token, "pro")

        cash_sum_after = db.query(ProfitSharingRecord).filter(
            ProfitSharingRecord.income_source == "member_fee"
        ).with_entities(
            func.sum(ProfitSharingRecord.amount)
        ).scalar() or 0

        cash_increase = cash_sum_after - cash_sum_before

        quota_after = db.query(ExperienceQuota).filter(
            ExperienceQuota.user_id == buyer.id
        ).first()
        experience_increase = quota_after.total - quota_before_total

        total_distributed = cash_increase + experience_increase

        assert total_distributed == order_amount == 3_000_000, (
            f"pro 等级守恒失败: 4路cash增加({cash_increase}) + 体验额度增加({experience_increase}) "
            f"= {total_distributed}, 期望 3000000"
        )

        if referrer_id:
            referrer = db.query(User).filter(User.id == referrer_id).first()
            expected = _expected_contribution(200, referrer.reputation_level)
            invite_paid_record = db.query(ContributionPoint).filter(
                ContributionPoint.user_id == referrer_id,
                ContributionPoint.source_type == "invite_paid",
            ).order_by(ContributionPoint.id.desc()).first()
            assert invite_paid_record is not None, "pro 等级也应生成 invite_paid 贡献积分记录"
            assert invite_paid_record.amount == expected, (
                f"invite_paid 入账应为 {expected}，实际 {invite_paid_record.amount}"
            )
