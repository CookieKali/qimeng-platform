"""统一响应封装"""
from typing import Any, Optional, Dict, Union
from pydantic import BaseModel


class ApiResponse(BaseModel):
    code: int = 0
    msg: str = "ok"
    data: Optional[Any] = None


def ok(data: Any = None, msg: str = "ok") -> Dict[str, Union[int, str, Any]]:
    return {"code": 0, "msg": msg, "data": data}


def fail(msg: str, code: int = 1, data: Any = None) -> Dict[str, Union[int, str, Any]]:
    return {"code": code, "msg": msg, "data": data}

