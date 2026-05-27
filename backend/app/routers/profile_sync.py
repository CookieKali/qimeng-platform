"""MemberProfile <-> Card 字段同步"""
from typing import Optional

from sqlalchemy.orm import Session

from ..models.card import Card
from ..models.profile import MemberProfile
from ..models.user import User


def get_or_create_member_profile(db: Session, user_id: int) -> MemberProfile:
    mp = db.query(MemberProfile).filter(MemberProfile.user_id == user_id).first()
    if not mp:
        mp = MemberProfile(user_id=user_id)
        db.add(mp)
        db.flush()
    return mp


def get_or_create_card(db: Session, user: User) -> Card:
    c = user.card
    if not c:
        c = Card(user_id=user.id)
        db.add(c)
        db.flush()
    return c


def profile_payload_to_card_fields(data: dict) -> dict:
    """将 API 入参映射到 cards 表字段"""
    card_fields = {}
    for key, value in data.items():
        if key == "personal_value":
            card_fields["bio"] = value or ""
        elif key == "city":
            card_fields["region"] = value or ""
        elif key == "talents_text":
            card_fields["talents"] = value or ""
        elif key == "resources_text":
            card_fields["status_supply"] = value or ""
        elif key == "needs_text":
            card_fields["status_demand"] = value or ""
        elif key == "roles":
            card_fields["tags"] = value or []
        elif key in (
            "company", "job_title", "industry", "region", "bio",
            "interests", "talents", "resources", "needs", "tags",
            "social_titles", "honors", "business_map", "qualifications", "privacy",
        ):
            card_fields[key] = value
    if "city" in data and "region" not in card_fields:
        card_fields["region"] = data["city"] or ""
    if "region" in data and "city" not in data:
        pass
    return card_fields


def apply_profile_update(db: Session, user: User, data: dict) -> None:
    """写入 member_profiles 并同步到 cards"""
    if not data:
        return
    mp = get_or_create_member_profile(db, user.id)
    card = get_or_create_card(db, user)

    mp_keys = {
        "company", "city", "personal_value", "talents_text", "resources_text", "needs_text",
    }
    for key, value in data.items():
        if key in mp_keys:
            setattr(mp, key, value)
        if key == "region" and "city" not in data:
            mp.city = value

    if "city" in data:
        mp.city = data["city"]
    if "company" in data:
        mp.company = data["company"]

    card_updates = profile_payload_to_card_fields(data)
    for key, value in card_updates.items():
        setattr(card, key, value)

    if mp.company is not None:
        card.company = mp.company or ""
    if mp.city is not None:
        card.region = mp.city or ""
    if mp.personal_value is not None:
        card.bio = mp.personal_value or ""
    if mp.talents_text is not None:
        card.talents = mp.talents_text or ""
    if mp.resources_text is not None:
        card.status_supply = mp.resources_text or ""
    if mp.needs_text is not None:
        card.status_demand = mp.needs_text or ""


def member_profile_response(mp: Optional[MemberProfile], card: Card) -> dict:
    city = (mp.city if mp and mp.city is not None else None) or card.region or ""
    company = (mp.company if mp and mp.company is not None else None) or card.company or ""
    personal_value = (mp.personal_value if mp and mp.personal_value is not None else None) or card.bio or ""
    talents_text = (mp.talents_text if mp and mp.talents_text is not None else None) or card.talents or ""
    resources_text = (
        (mp.resources_text if mp and mp.resources_text is not None else None) or card.status_supply or ""
    )
    needs_text = (mp.needs_text if mp and mp.needs_text is not None else None) or card.status_demand or ""
    return {
        "company": company,
        "city": city,
        "personal_value": personal_value,
        "talents_text": talents_text,
        "resources_text": resources_text,
        "needs_text": needs_text,
        "job_title": card.job_title or "",
        "industry": card.industry or "",
        "region": card.region or "",
        "bio": card.bio or "",
        "interests": card.interests,
        "talents": card.talents,
        "resources": card.resources,
        "needs": card.needs,
        "tags": card.tags,
        "roles": card.tags or [],
        "social_titles": card.social_titles,
        "honors": card.honors,
        "business_map": card.business_map,
        "qualifications": card.qualifications,
        "privacy": card.privacy,
        "status_supply": card.status_supply,
        "status_demand": card.status_demand,
    }
