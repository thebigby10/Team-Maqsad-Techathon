"""Request and response Pydantic schemas."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    """Body for POST /entry."""

    name: str = Field(..., min_length=1)
    pin: int = Field(..., ge=0)
    is_turned_off: bool = True
    power_usage: float = Field(..., gt=0, description="Power draw in watts")
    room_number: str = Field(..., min_length=1)


class DeviceRead(BaseModel):
    id: str
    name: str
    pin: int
    is_turned_off: bool
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
    is_turned_off: bool
    status: str  # "running" | "turned_off"
    usage_id: Optional[int] = None
    total_cost: Optional[float] = None


class UsageHistoryResponse(BaseModel):
    device_id: str
    records: List[UsageRead]