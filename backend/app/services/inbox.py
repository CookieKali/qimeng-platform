"""Inbox notification helpers"""
from typing import Optional

from sqlalchemy.orm import Session

from ..models.inbox import InboxMessage, INBOX_TYPES


def send_inbox_message(
    db: Session,
    *,
    to_user_id: int,
    type: str,
    title: str,
    content: str = "",
    from_user_id: Optional[int] = None,
    related_id: Optional[int] = None,
) -> InboxMessage:
    if type not in INBOX_TYPES:
        raise ValueError(f"invalid inbox type: {type}")
    msg = InboxMessage(
        from_user_id=from_user_id,
        to_user_id=to_user_id,
        type=type,
        title=title,
        content=content or "",
        related_id=related_id,
        is_read=False,
    )
    db.add(msg)
    return msg
