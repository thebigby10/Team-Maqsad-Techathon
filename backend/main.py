"""FastAPI backend for the device power tracker."""

import asyncio
import json
from datetime import datetime, timezone
from typing import AsyncIterator, List, Optional

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
    DeviceUsageToday,
    EntryResponse,
    ToggleResponse,
    UsageHistoryResponse,
    UsageRead,
    UsageTodaySummary,
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
# In-process pub/sub for SSE notifications.
# Any toggle broadcasts the current /devices payload to all connected
# /devices/stream listeners. Subscribers are asyncio.Queue instances.
# ---------------------------------------------------------------------------

_subscribers: List[asyncio.Queue[dict]] = []


def _broadcast(payload: dict) -> None:
    """Push a payload to every connected SSE subscriber.

    Each subscriber has its own queue, so a slow client can't block the
    toggle handler. If a queue is full we drop the oldest message.
    """
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:
                pass


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


def _ensure_utc(dt: datetime) -> datetime:
    """SQLite strips timezone info on read; assume UTC if naive."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _elapsed_hours(start: datetime, stop: datetime) -> float:
    return (_ensure_utc(stop) - _ensure_utc(start)).total_seconds() / 3600.0


def _compute_cost(watts: float, start: datetime, stop: datetime) -> float:
    """cost = (watts / 1000) * hours * RATE_PER_KWH, rounded to 6 decimals."""
    hours = _elapsed_hours(start, stop)
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


def _devices_payload(session: Session) -> dict:
    """Build the payload broadcast to /devices and /devices/stream clients.

    Includes live aggregated wattage so the dashboard can show
    \"Total power right now: 740W\" without re-aggregating client-side.
    """
    devices = session.exec(select(Device)).all()
    live_watts = sum(d.power_usage for d in devices if d.is_running)
    return {
        "count": len(devices),
        "total_current_watts": round(live_watts, 2),
        "devices": [_device_to_read(d).model_dump(mode="json") for d in devices],
    }


def _utc_midnight_today() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _kwh_today_for_device(session: Session, device: Device, today_start: datetime) -> tuple[float, float, Optional[datetime]]:
    """Return (kwh_today, cost_today, open_session_started_at) for one device.

    Sums energy from any usage row that overlaps today:
    - Closed rows: full (start, stop) clamped to [today_start, now].
    - Open (running) row: start clamped to [today_start, now], stop=now.

    For pure kWh: watts * hours / 1000.
    Cost: kWh * RATE_PER_KWH.
    """
    statement = (
        select(Usage)
        .where(Usage.device_id == device.id)
        .where(Usage.start_datetime < datetime.now(timezone.utc))  # any past or now
    )
    rows = session.exec(statement).all()

    now = datetime.now(timezone.utc)
    total_hours = 0.0
    open_started: Optional[datetime] = None

    for row in rows:
        start = _ensure_utc(row.start_datetime)
        stop = _ensure_utc(row.stop_datetime) if row.stop_datetime else now

        # Clamp the window to [today_start, now].
        clamped_start = max(start, today_start)
        clamped_stop = min(stop, now)
        if clamped_stop <= clamped_start:
            continue

        total_hours += (clamped_stop - clamped_start).total_seconds() / 3600.0
        if row.status == "running" and row.stop_datetime is None:
            open_started = start

    kwh = round((device.power_usage / 1000.0) * total_hours, 6)
    cost = round(kwh * RATE_PER_KWH, 6)
    return kwh, cost, open_started


def _today_summary(session: Session) -> UsageTodaySummary:
    today_start = _utc_midnight_today()
    devices = session.exec(select(Device)).all()

    per_device: List[DeviceUsageToday] = []
    total_kwh = 0.0
    total_cost = 0.0
    live_watts = 0.0

    for d in devices:
        kwh, cost, open_started = _kwh_today_for_device(session, d, today_start)
        total_kwh += kwh
        total_cost += cost
        if d.is_running:
            live_watts += d.power_usage
        per_device.append(
            DeviceUsageToday(
                device_id=d.id,
                name=d.name,
                pin=d.pin,
                room_number=d.room_number,
                is_running=d.is_running,
                kwh_today=kwh,
                cost_today=cost,
                open_session_started_at=open_started,
            )
        )

    return UsageTodaySummary(
        generated_at=datetime.now(timezone.utc),
        kwh_today=round(total_kwh, 6),
        cost_today=round(total_cost, 6),
        total_current_watts=round(live_watts, 2),
        devices=per_device,
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

    # New device might be running -> push fresh state.
    _broadcast(_devices_payload(session))

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

    if new_is_running:
        # Device turned ON -> open a new usage session.
        new_usage = Usage(
            device_id=device.id, start_datetime=now, status="running"
        )
        session.add(new_usage)
        session.commit()
        session.refresh(device)
        session.refresh(new_usage)

        _broadcast(_devices_payload(session))

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
    _broadcast(_devices_payload(session))

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
    """List all devices with their current state and live aggregated wattage."""
    return _devices_payload(session)


@app.get("/usage/today/summary", response_model=UsageTodaySummary)
def usage_today_summary(session: Session = Depends(get_session)) -> UsageTodaySummary:
    """Aggregate kWh, cost, and live wattage across all devices for today (UTC).

    Designed for the Discord bot: \"Total power right now: 740W.
    Today's estimated usage: 4.2 kWh.\"
    """
    return _today_summary(session)


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


# ---------------------------------------------------------------------------
# Server-Sent Events stream
# ---------------------------------------------------------------------------

from fastapi.responses import StreamingResponse  # noqa: E402  (kept below app init for clarity)


@app.get("/devices/stream")
async def stream_devices(session: Session = Depends(get_session)) -> StreamingResponse:
    """Push the /devices payload to the client in real time.

    The first event is the current snapshot (sent immediately on connect).
    Subsequent events fire whenever POST /toggle or POST /entry mutates state.

    Format: standard SSE — each message is `data: <json>\\n\\n`.
    Connect with `EventSource("/devices/stream")` on the frontend.
    """
    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=32)
    _subscribers.append(queue)
    initial = _devices_payload(session)

    async def event_generator() -> AsyncIterator[bytes]:
        try:
            # Initial snapshot.
            yield f"data: {json.dumps(initial)}\n\n".encode("utf-8")

            while True:
                payload = await queue.get()
                yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
        finally:
            try:
                _subscribers.remove(queue)
            except ValueError:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable buffering on nginx-style proxies
        },
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)