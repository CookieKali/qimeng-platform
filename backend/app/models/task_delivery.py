"""任务交付成果与发布方验收"""
import json
from datetime import datetime
from typing import Any, List, Optional

from sqlalchemy import Column, Integer, Text, DateTime, String, ForeignKey

from ..database import Base


class TaskDelivery(Base):
    """执行方提交交付成果，发布方审核"""
    __tablename__ = "task_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    executor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(Text, default="")
    attachments = Column(Text, nullable=True)  # JSON array of image URLs
    status = Column(String(16), default="pending", index=True)  # pending/approved/rejected
    reject_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    def attachments_list(self) -> List[str]:
        if not self.attachments:
            return []
        try:
            data = json.loads(self.attachments)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, TypeError):
            return []

    def set_attachments(self, urls: Optional[List[Any]]) -> None:
        if not urls:
            self.attachments = None
        else:
            self.attachments = json.dumps(list(urls), ensure_ascii=False)
