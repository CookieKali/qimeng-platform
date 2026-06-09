"""企盟 Qimeng Platform - FastAPI 主入口"""
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import init_db, SessionLocal
from .core.response import ok
from .routers import auth, users, cards, friends, tasks, activities, spaces, credit, reputation, profit, ai, stats, admin, membership, channel, contribution, inbox, messages, search, payment, card_shares

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 验证配置
if settings.APP_ENV == "prod":
    settings.validate_secret_key()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # 自动跑种子数据（数据库为空时）
    try:
        from .seeds.seed_data import (
            maybe_seed, ensure_demo_user, ensure_super_admin, ensure_test_friend_users,
        )
        with SessionLocal() as db:
            maybe_seed(db)
            ensure_demo_user(db)
            ensure_super_admin(db)
            ensure_test_friend_users(db)
        logger.info("[seed] seed data loaded successfully")
    except Exception as e:
        logger.warning(f"[seed] skipped: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="2.1.0",
    description="以链接者为核心的资源变现操作系统 - 13大模块全量后端",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """未处理异常：统一 500，不向客户端泄露堆栈；HTTPException 交由 FastAPI 默认处理"""
    if isinstance(exc, HTTPException):
        raise exc
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"code": -1, "msg": "服务器内部错误", "data": None},
    )


_origins = settings.cors_origins_list
if _origins == ["*"]:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/")
def root():
    return ok({
        "app": settings.APP_NAME, "version": "2.1.0",
        "docs": "/docs", "modules": 13,
        "tagline": "以链接者为核心的资源变现操作系统",
    })


@app.get("/api/health")
def health():
    return ok({"status": "healthy"})


# 注册13大模块
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.v1_router)
app.include_router(cards.router)
app.include_router(cards.v1_router)
app.include_router(friends.router)
app.include_router(friends.v1_router)
app.include_router(tasks.router)
app.include_router(activities.router)
app.include_router(activities.v1_router)
app.include_router(spaces.router)
app.include_router(spaces.v1_router)
app.include_router(credit.router)
app.include_router(reputation.router)
app.include_router(profit.router)
app.include_router(ai.router)
app.include_router(stats.router)
app.include_router(admin.router)
app.include_router(membership.router)
app.include_router(payment.router)
app.include_router(channel.router)
app.include_router(contribution.router)
app.include_router(inbox.router)
app.include_router(messages.router)
app.include_router(search.router)
app.include_router(card_shares.router)

_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
(_UPLOADS_DIR / "avatars").mkdir(parents=True, exist_ok=True)
(_UPLOADS_DIR / "covers").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")

