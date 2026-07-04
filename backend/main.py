"""FastAPI backend for the device power tracker."""

from datetime import datetime, timezone
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from config import RATE_PER_KWH
from database import get_session, init_db
from models import Device, Usage
from schemas import (
    DeviceCreate,
    DeviceRead,
    EntryResponse,
    ToggleResponse,
    UsageHistoryResponse,
    UsageRead,
)

app = FastAPI(title="Device Power Tracker", version="1.0.0")

# CORS: open by default so any frontend (Next.js, plain HTML, etc.) can
# hit the API during development. Lock down to specific origins before
# deploying to a shared network. The ESP32 makes server-to-server calls
# and isn't affected by CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # must be False when allow_origins is ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    """Create database tables on application start."""
    init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_device(session: Session, identifier: str) -> Optional[Device]:
    """Find a device by its UUID first, then fall back to its pin.

    The frontend or ESP32 may identify a device by either the UUID returned
    from /entry or by the GPIO pin number it was registered with.
    """
    device = session.get(Device, identifier)
    if device is not None:
        return device

    # Pin is an int; ignore identifiers that obviously aren't numeric.
    if identifier.isdigit():
        pin = int(identifier)
        statement = select(Device).where(Device.pin == pin)
        device = session.exec(statement).first()

    return device


def _compute_cost(watts: float, start: datetime, stop: datetime) -> float:
    """cost = (watts / 1000) * hours * RATE_PER_KWH, rounded to 6 decimals.

    SQLite strips timezone info on read, so we normalize both ends to UTC-aware.
    """
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if stop.tzinfo is None:
        stop = stop.replace(tzinfo=timezone.utc)

    elapsed_seconds = (stop - start).total_seconds()
    hours = elapsed_seconds / 3600.0
    return round((watts / 1000.0) * hours * RATE_PER_KWH, 6)


def _device_to_read(device: Device) -> DeviceRead:
    return DeviceRead(
        id=device.id,
        name=device.name,
        pin=device.pin,
        is_running=device.is_running,
        power_usage=device.power_usage,
        room_number=device.room_number,
        last_usage_datetime=device.last_usage_datetime,
    )


def _usage_to_read(usage: Usage) -> UsageRead:
    return UsageRead(
        id=usage.id,
        device_id=usage.device_id,
        start_datetime=usage.start_datetime,
        stop_datetime=usage.stop_datetime,
        status=usage.status,
        total_cost=usage.total_cost,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok"}


@app.post("/entry", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceCreate,
    session: Session = Depends(get_session),
) -> EntryResponse:
    """Register a new device and return its generated UUID."""
    # Reject duplicate pins up-front for a clean 400 instead of a 500 on commit.
    existing = session.exec(select(Device).where(Device.pin == payload.pin)).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Device with pin {payload.pin} already exists",
        )

    device = Device(
        name=payload.name,
        pin=payload.pin,
        is_running=payload.is_running,
        power_usage=payload.power_usage,
        room_number=payload.room_number,
    )
    session.add(device)
    session.commit()
    session.refresh(device)

    return EntryResponse(id=device.id, status="created", device=_device_to_read(device))


@app.post("/toggle/{identifier}", response_model=ToggleResponse)
def toggle_device(
    identifier: str,
    session: Session = Depends(get_session),
) -> ToggleResponse:
    """Flip a device's running state and open or close a usage record.

    State model:
    - `is_running == True`  -> device is currently ON. A usage row exists
      with status="running".
    - `is_running == False` -> device is currently OFF. Any prior session
      has been closed (status="turned_off") with stop_datetime + total_cost.

    Toggling flips the state:
    - If new state is True  -> the device was just turned ON. Open a new
      usage row (status="running", start_datetime=now).
    - If new state is False -> the device was just turned OFF. Find the
      running usage row, close it (status="turned_off", stop_datetime=now,
      total_cost=...).
    """
    device = _resolve_device(session, identifier)
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device '{identifier}' not found",
        )

    now = datetime.now(timezone.utc)
    device.last_usage_datetime = now

    new_is_running = not device.is_running
    device.is_running = new_is_running
    session.add(device)

    usage_id: Optional[int] = None
    total_cost: Optional[float] = None
    response_status: str

    if new_is_running:
        # Device turned ON -> open a new usage session.
        new_usage = Usage(
            device_id=device.id, start_datetime=now, status="running"
        )
        session.add(new_usage)
        session.commit()
        session.refresh(device)
        session.refresh(new_usage)

        return ToggleResponse(
            id=device.id,
            pin=device.pin,
            is_running=device.is_running,
            status="running",
            usage_id=new_usage.id,
            total_cost=None,
        )

    # Device turned OFF -> close the running session, compute cost.
    running = session.exec(
        select(Usage).where(
            Usage.device_id == device.id, Usage.status == "running"
        )
    ).first()

    if running is not None:
        running.stop_datetime = now
        running.status = "turned_off"
        running.total_cost = _compute_cost(
            device.power_usage, running.start_datetime, now
        )
        usage_id = running.id
        total_cost = running.total_cost
        session.add(running)

    session.commit()
    session.refresh(device)

    return ToggleResponse(
        id=device.id,
        pin=device.pin,
        is_running=device.is_running,
        status="turned_off",
        usage_id=usage_id,
        total_cost=total_cost,
    )


@app.get("/devices")
def list_devices(session: Session = Depends(get_session)) -> dict:
    """List all registered devices with their current state."""
    devices = session.exec(select(Device)).all()
    return {
        "count": len(devices),
        "devices": [_device_to_read(d).model_dump(mode="json") for d in devices],
    }


@app.get("/usage/{identifier}", response_model=UsageHistoryResponse)
def get_usage_history(
    identifier: str,
    session: Session = Depends(get_session),
) -> UsageHistoryResponse:
    """Return all usage sessions for a device, newest first."""
    device = _resolve_device(session, identifier)
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Device '{identifier}' not found",
        )

    statement = (
        select(Usage)
        .where(Usage.device_id == device.id)
        .order_by(Usage.start_datetime.desc())
    )
    rows = session.exec(statement).all()

    return UsageHistoryResponse(
        device_id=device.id,
        records=[_usage_to_read(r) for r in rows],
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)