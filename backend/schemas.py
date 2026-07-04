"""Request and response Pydantic schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    """Body for POST /entry."""

    name: str = Field(..., min_length=1)
    pin: int = Field(..., ge=0)
    is_running: bool = False
    power_usage: float = Field(..., gt=0, description="Power draw in watts")
    room_number: str = Field(..., min_length=1)


class DeviceRead(BaseModel):
    id: str
    name: str
    pin: int
    is_running: bool
    power_usage: float
    room_number: str
    last_usage_datetime: Optional[datetime] = None


class EntryResponse(BaseModel):
    id: str
    status: str = "created"
    device: DeviceRead


class UsageRead(BaseModel):
    id: int
    device_id: str
    start_datetime: datetime
    stop_datetime: Optional[datetime] = None
    status: str
    total_cost: Optional[float] = None


class ToggleResponse(BaseModel):
    id: str
    pin: int
    is_running: bool
    status: str  # "running" | "turned_off"
    usage_id: Optional[int] = None
    total_cost: Optional[float] = None


class UsageHistoryResponse(BaseModel):
    device_id: str
    records: List[UsageRead]


class DeviceUsageToday(BaseModel):
    """kWh and cost accrued today for a single device."""

    device_id: str
    name: str
    pin: int
    room_number: str
    is_running: bool
    kwh_today: float
    cost_today: float
    open_session_started_at: Optional[datetime] = None


class UsageTodaySummary(BaseModel):
    """Aggregate of all devices' usage since 00:00 UTC today."""

    generated_at: datetime
    kwh_today: float
    cost_today: float
    total_current_watts: float
    devices: List[DeviceUsageToday]