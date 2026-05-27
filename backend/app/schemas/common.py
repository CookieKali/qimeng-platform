"""通用 schemas"""
from typing import Optional, Any, List
from pydantic import BaseModel


class Page(BaseModel):
    page: int = 1
    page_size: int = 20
    total: int = 0
    items: List[Any] = []
