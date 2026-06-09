"""图片上传：MIME / 魔数 / 文件名识别（兼容微信小程序 octet-stream）"""
from fastapi import HTTPException

MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": None,
    "image/heif": None,
    "application/octet-stream": None,
    "": None,
}


def _is_heic(data: bytes) -> bool:
    if len(data) < 12 or data[4:8] != b"ftyp":
        return False
    brand = data[8:12]
    return brand in (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"avif")


def resolve_image_ext(data: bytes, content_type: str = "", filename: str = "") -> str:
    """根据 Content-Type、文件魔数或文件名推断扩展名"""
    if _is_heic(data):
        raise HTTPException(
            400,
            "暂不支持 HEIC/HEIF 格式，请换 JPG 或 PNG，或重新选图时使用压缩图",
        )

    ct = (content_type or "").lower().split(";")[0].strip()
    mapped = MIME_TO_EXT.get(ct)
    if mapped:
        return mapped

    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        raise HTTPException(400, "暂不支持 GIF，请使用 JPG 或 PNG")

    name = (filename or "").lower()
    if name.endswith((".heic", ".heif")):
        raise HTTPException(400, "暂不支持 HEIC/HEIF 格式，请换 JPG 或 PNG 后再上传")
    if name.endswith((".jpg", ".jpeg")):
        return ".jpg"
    if name.endswith(".png"):
        return ".png"
    if name.endswith(".webp"):
        return ".webp"
    if name.endswith(".gif"):
        raise HTTPException(400, "暂不支持 GIF，请使用 JPG 或 PNG")

    raise HTTPException(400, "仅支持 JPG、PNG、WEBP 格式图片")
