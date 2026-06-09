"""V2.1 分润体系 - 渠道关系 + 分润流水 + 空间站结算"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey

from ..database import Base


class ChannelRelation(Base):
    """渠道关系链 - 推荐/引荐/合伙人/入驻"""
    __tablename__ = "channel_relations"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    relation_type = Column(String(16), default="recommend")    # recommend/refer/partner/station
    level = Column(String(16), default="direct")               # direct/level2/team
    status = Column(String(16), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)


class ProfitSharingRecord(Base):
    """分润流水（区块链存证字段保留）"""
    __tablename__ = "profit_sharing_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    period = Column(String(16), default="")             # YYYY-MM
    # member_fee / activity / station_fa / station_consume / referral / task_referral / station_dividend
    income_source = Column(String(32), default="referral")
    source_amount = Column(Float, default=0)            # 原始成交额
    percentage = Column(Float, default=20.0)            # 分润比例（%）
    amount = Column(Float, default=0)                   # 实得金额
    status = Column(String(16), default="pending")      # pending/confirmed/paid
    tx_hash = Column(String(128), default="")           # 区块链存证
    note = Column(String(255), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)


class StationProfitSettlement(Base):
    """空间站月度分润结算"""
    __tablename__ = "station_profit_settlements"

    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False, index=True)
    period = Column(String(16), default="")             # YYYY-MM
    total_revenue = Column(Float, default=0)
    cost = Column(Float, default=0)
    net_profit = Column(Float, default=0)
    shareholder_dividend_rate = Column(Float, default=4.0)   # %
    distributed_amount = Column(Float, default=0)
    breakdown = Column(JSON, default=dict)              # 五层收入结构明细
    created_at = Column(DateTime, default=datetime.utcnow)
