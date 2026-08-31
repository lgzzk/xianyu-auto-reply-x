"""按订单签发的限时下载凭证。"""
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from common.db.base_class import Base

class ResourceDownloadTicket(Base):
    __tablename__ = "xy_resource_download_tickets"
    __table_args__ = (UniqueConstraint("resource_id", "order_id", name="uq_resource_order"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    resource_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    order_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(96), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    max_downloads: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
