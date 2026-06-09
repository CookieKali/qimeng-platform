"""活动/任务封面图存储（独立于用户头像）"""
import logging
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .images import resolve_image_ext

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BACKEND_ROOT / "uploads"
COVER_DIR = UPLOADS_DIR / "covers"


def ensure_cover_dir() -> None:
    COVER_DIR.mkdir(parents=True, exist_ok=True)


def save_cover_image(file: UploadFile) -> str:
    """保存封面图，返回相对 URL 路径 /uploads/covers/{uuid}.ext"""
    ensure_cover_dir()
    data = file.file.read()
    if not data:
        raise HTTPException(400, "图片文件为空")

    ext = resolve_image_ext(data, file.content_type or "", file.filename or "")
    filename = f"{uuid.uuid4().hex}{ext}"
    path = COVER_DIR / filename
    path.write_bytes(data)
    return f"/uploads/covers/{filename}"
