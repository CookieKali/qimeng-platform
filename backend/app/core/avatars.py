"""用户头像文件存储"""
import logging
from pathlib import Path

from fastapi import HTTPException, UploadFile

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BACKEND_ROOT / "uploads"
AVATAR_DIR = UPLOADS_DIR / "avatars"

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def ensure_avatar_dir() -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)


def save_user_avatar(user_id: int, file: UploadFile) -> str:
    """保存头像文件，返回相对 URL 路径 /uploads/avatars/{id}.ext"""
    ensure_avatar_dir()
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, "仅支持 JPG、PNG、WEBP 格式头像")
    ext = ALLOWED_CONTENT_TYPES[content_type]
    data = file.file.read()
    if not data:
        raise HTTPException(400, "头像文件为空")
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(400, "头像不能超过 2MB")

    for old in AVATAR_DIR.glob(f"{user_id}.*"):
        try:
            old.unlink()
        except OSError:
            logger.warning("failed to remove old avatar %s", old)

    filename = f"{user_id}{ext}"
    path = AVATAR_DIR / filename
    path.write_bytes(data)
    return f"/uploads/avatars/{filename}"
