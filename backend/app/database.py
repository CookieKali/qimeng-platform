"""SQLAlchemy 引擎与会话工厂"""
import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings

logger = logging.getLogger(__name__)

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, echo=False, future=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_task_columns() -> None:
    """为 tasks 表补充 completed_at（旧库兼容）"""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if "tasks" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("tasks")}
        if "completed_at" not in cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN completed_at DATETIME"))
            conn.commit()
            logger.info("migrated tasks.completed_at")
        if "cover_url" not in cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN cover_url VARCHAR(512) DEFAULT ''"))
            conn.commit()
            logger.info("migrated tasks.cover_url")


def _migrate_task_participant_columns() -> None:
    """旧库用中文列名，重命名为与 ORM 一致的英文字段"""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    renames = [
        ("score_履约", "score_performance"),
        ("score_质量", "score_quality"),
        ("score_专业", "score_professional"),
        ("score_合规", "score_compliance"),
    ]
    with engine.connect() as conn:
        cols = {c["name"] for c in inspect(conn).get_columns("task_participants")}
        for old, new in renames:
            if old in cols and new not in cols:
                conn.execute(text(f'ALTER TABLE task_participants RENAME COLUMN "{old}" TO {new}'))
                cols.discard(old)
                cols.add(new)
                logger.info("migrated task_participants.%s -> %s", old, new)
        conn.commit()


def _migrate_activity_checkin_columns() -> None:
    """activity_checkins 补充发起人确认签到字段"""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if "activity_checkins" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("activity_checkins")}
        if "signed_in" not in cols:
            conn.execute(text(
                "ALTER TABLE activity_checkins ADD COLUMN signed_in BOOLEAN DEFAULT 0"
            ))
            logger.info("migrated activity_checkins.signed_in")
        if "signed_in_at" not in cols:
            conn.execute(text(
                "ALTER TABLE activity_checkins ADD COLUMN signed_in_at DATETIME"
            ))
            logger.info("migrated activity_checkins.signed_in_at")
        conn.commit()


def _migrate_booking_columns() -> None:
    """bookings 表补充审核与预约备注字段"""
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    adds = [
        ("purpose", "VARCHAR(128) DEFAULT ''"),
        ("participant_count", "INTEGER DEFAULT 1"),
        ("note", "TEXT DEFAULT ''"),
        ("audit_status", "VARCHAR(16) DEFAULT 'pending'"),
        ("reject_reason", "VARCHAR(255) DEFAULT ''"),
        ("approved_by", "INTEGER"),
        ("approved_at", "DATETIME"),
        ("updated_at", "DATETIME"),
    ]
    with engine.connect() as conn:
        insp = inspect(conn)
        if "bookings" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("bookings")}
        for name, ddl in adds:
            if name not in cols:
                conn.execute(text(f"ALTER TABLE bookings ADD COLUMN {name} {ddl}"))
                logger.info("migrated bookings.%s", name)
        conn.commit()


def _migrate_user_total_shares() -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if "users" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        if "total_shares" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN total_shares INTEGER DEFAULT 0"))
            conn.commit()
            logger.info("migrated users.total_shares")


def _migrate_user_wx_openid() -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if "users" not in insp.get_table_names():
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        if "wx_openid" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN wx_openid VARCHAR(64)"))
            conn.commit()
            logger.info("migrated users.wx_openid")


def init_db():
    """初始化数据库 - 创建所有表"""
    from . import models  # noqa: F401 触发模型注册
    Base.metadata.create_all(bind=engine)
    _migrate_task_columns()
    _migrate_task_participant_columns()
    _migrate_activity_checkin_columns()
    _migrate_booking_columns()
    _migrate_user_wx_openid()
    _migrate_user_total_shares()
