"""SQLModel table models for the device power tracker."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _new_uuid() -> str:
    """Server-side UUID4 generator."""
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    """UTC-aware now."""
    return datetime.now(timezone.utc)


class Device(SQLModel, table=True):
    """A registered electrical device."""

    id: str = Field(default_factory=_new_uuid, primary_key=True, index=True)
    name: str = Field(index=True)
    pin: int = Field(unique=True, index=True)
    is_turned_off: bool = Field(default=True)
    power_usage: float = Field(gt=0)  # watts
    room_number: str = Field(index=True)
    last_usage_datetime: Optional[datetime] = Field(default=None)


class Usage(SQLModel, table=True):
    """A single on/off session for a device."""

    id: Optional[int] = Field(default=None, primary_key=True)
    device_id: str = Field(foreign_key="device.id", index=True)
    start_datetime: datetime = Field(default_factory=_utcnow)
    stop_datetime: Optional[datetime] = Field(default=None)
    status: str = Field(default="running")  # "running" | "turned_off"
    total_cost: Optional[float] = Field(default=None)  # USD, computed on close