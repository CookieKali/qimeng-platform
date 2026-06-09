"""用户头像文件存储"""
import logging
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from .images import resolve_image_ext

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
UPLOADS_DIR = BACKEND_ROOT / "uploads"
AVATAR_DIR = UPLOADS_DIR / "avatars"

MAX_AVATAR_SIDE = 512
MAX_AVATAR_BYTES = 2 * 1024 * 1024


def ensure_avatar_dir() -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)


def normalize_avatar_bytes(data: bytes) -> bytes:
    """压缩为 JPEG，限制边长与体积，便于小程序展示"""
    try:
        img = Image.open(BytesIO(data))
        img = img.convert("RGB")
    except UnidentifiedImageError as exc:
        raise HTTPException(400, "无法识别图片格式，请换 JPG 或 PNG") from exc

    img.thumbnail((MAX_AVATAR_SIDE, MAX_AVATAR_SIDE), Image.Resampling.LANCZOS)
    quality = 85
    while quality >= 45:
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        out = buf.getvalue()
        if len(out) <= MAX_AVATAR_BYTES:
            return out
        quality -= 10
    raise HTTPException(400, "头像图片过大，请换一张较小的照片")


def save_user_avatar(user_id: int, file: UploadFile) -> str:
    """保存头像文件，返回相对 URL 路径 /uploads/avatars/{id}.jpg"""
    ensure_avatar_dir()
    data = file.file.read()
    if not data:
        raise HTTPException(400, "头像文件为空")

    resolve_image_ext(data, file.content_type or "", file.filename or "")
    data = normalize_avatar_bytes(data)

    for old in AVATAR_DIR.glob(f"{user_id}.*"):
        try:
            old.unlink()
        except OSError:
            logger.warning("failed to remove old avatar %s", old)

    filename = f"{user_id}.jpg"
    path = AVATAR_DIR / filename
    path.write_bytes(data)
    return f"/uploads/avatars/{filename}"


def delete_user_avatar(user_id: int) -> None:
    """删除用户已上传的头像文件（若存在）"""
    ensure_avatar_dir()
    for old in AVATAR_DIR.glob(f"{user_id}.*"):
        try:
            old.unlink()
        except OSError:
            logger.warning("failed to remove avatar %s", old)
