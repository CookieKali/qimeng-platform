"""空间 + 空间站 + 联席股东 + 预约"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, JSON, ForeignKey, Boolean

from ..database import Base


class Station(Base):
    """空间站 - V2.0 区域商业枢纽"""
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    level = Column(String(16), default="city")     # hq / province / city / district
    parent_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    region = Column(String(64), default="")
    address = Column(String(255), default="")
    cover_url = Column(String(512), default="")
    description = Column(Text, default="")
    operator_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # 店长
    member_count = Column(Integer, default=0)
    shareholder_count = Column(Integer, default=0)
    annual_revenue = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class StationShareholder(Base):
    """空间站联席股东 - 20人/股20万模型"""
    __tablename__ = "station_shareholders"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    shares = Column(Float, default=1.0)            # 股数
    invest_amount = Column(Float, default=200000)   # 投资额
    subscribe_date = Column(DateTime, default=datetime.utcnow)
    rights_mask = Column(Integer, default=0)       # 10项权益 bitmap
    industry = Column(String(64), default="")      # 所属产业
    is_active = Column(Boolean, default=True)


class Space(Base):
    """可预约空间"""
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True, index=True)
    name = Column(String(128), nullable=False)
    type = Column(String(32), default="多功能厅")
    capacity = Column(Integer, default=20)
    address = Column(String(255), default="")
    cover_url = Column(String(512), default="")
    description = Column(Text, default="")
    price_per_hour = Column(Float, default=100.0)
    facilities = Column(JSON, default=list)        # ["投影", "白板", "茶水"]
    available_hours = Column(String(64), default="09:00-22:00")
    rating = Column(Float, default=5.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Booking(Base):
    """空间预约"""
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    space_id = Column(Integer, ForeignKey("spaces.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id"), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    hours = Column(Float, default=2)
    amount = Column(Float, default=0)
    status = Column(String(16), default="pending")  # pending/paid/in_use/finished/cancelled
    is_free_trial = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
