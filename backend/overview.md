# Backend Overview

A FastAPI service in this directory that tracks electrical devices and how much they cost to run. SQLite (via SQLModel) for persistence. The ESP32 and a future frontend talk to it over HTTP.

## File layout

```
backend/
├── main.py          # FastAPI app + all 5 endpoints
├── models.py        # SQLModel table models (Device, Usage)
├── schemas.py       # Pydantic request/response shapes
├── database.py      # Engine, get_session dependency, init_db()
├── config.py        # DB_URL ("sqlite:///./IOT.db"), RATE_PER_KWH = 0.15
├── requirements.txt # fastapi, sqlmodel, uvicorn, ...
├── .gitignore       # ignores .venv/, *.db, __pycache__/, etc.
└── overview.md      # this file
```

## Tables

Both auto-created on startup by `init_db()` in `database.py`.

### `device`
The registry of physical devices.

| Column | Type | Notes |
|---|---|---|
| `id` | str (UUID4) | PK, server-generated |
| `name` | str | Human label, indexed |
| `pin` | int | GPIO pin, **unique**, indexed |
| `is_running` | bool | Current state — see toggle semantics below |
| `power_usage` | float | Watts, must be > 0 |
| `room_number` | str | Required, indexed |
| `last_usage_datetime` | datetime? | Set to `now()` on every toggle |

### `usage`
Append-only log of on/off sessions.

| Column | Type | Notes |
|---|---|---|
| `id` | int | PK, autoincrement |
| `device_id` | str | FK → `device.id`, indexed |
| `start_datetime` | datetime | Set when session opens |
| `stop_datetime` | datetime? | Set when session closes |
| `status` | str | `"running"` or `"turned_off"` |
| `total_cost` | float? | USD, computed on close |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness probe → `{"status":"ok"}` |
| `POST` | `/entry` | Register a device, returns UUID |
| `POST` | `/toggle/{ID}` | Flip on/off state, open/close usage session |
| `GET` | `/devices` | List all devices + live aggregated wattage |
| `GET` | `/usage/today/summary` | Aggregate kWh, cost, and live wattage across all devices for today (UTC) |
| `GET` | `/usage/{ID}` | Usage history for a device |
| `GET` | `/devices/stream` | **Server-Sent Events** stream — pushes the `/devices` payload on every state change |

`{ID}` in `/toggle` and `/usage` accepts **either** the UUID **or** the pin number — `_resolve_device()` in `main.py` tries UUID lookup first, then falls back to pin.

## Toggle semantics

`is_running` is a straight **state boolean** — `True` means the device is currently ON, `False` means OFF. `/toggle/{ID}` flips it:

| New `is_running` | Action |
|---|---|
| `True` (turned ON) | Open a new `usage` row: `status="running"`, `start_datetime=now` |
| `False` (turned OFF) | Close the open `usage` row: `stop_datetime=now`, `status="turned_off"`, compute `total_cost` |

If the device is flipped OFF but no open `usage` row exists (e.g. registered with `is_running=true` and never started a session through the toggle), the close is a no-op: `usage_id=null`, `total_cost=null`. This makes the state flag and the `usage` table tolerant to desyncs.

Every toggle also bumps `device.last_usage_datetime = now()`.

### Cost calculation
On close: `total_cost = (power_usage / 1000) × hours_elapsed × RATE_PER_KWH`, rounded to 6 decimals. So a 60W bulb on for 1 hour costs `0.06 × 0.15 = $0.009`.

## Request flow (toggle example)

```
POST /toggle/3                         # device registered with is_running=false
  → is_running flips: false -> true
  → creates Usage(start=now, status="running")
  → sets device.last_usage_datetime=now
  → broadcasts fresh /devices payload to all SSE subscribers
  → returns ToggleResponse(is_running=true, usage_id=1, status="running", total_cost=null)

POST /toggle/3   (1 second later)
  → is_running flips: true -> false
  → finds the running Usage row
  → sets stop=now, status="turned_off", total_cost = 60W × 1s × 0.15/3600 ≈ 0.000009
  → broadcasts fresh /devices payload to all SSE subscribers
  → returns ToggleResponse(is_running=false, usage_id=1, status="turned_off", total_cost=9e-6)
```

## Live wattage and today's kWh

Two things the dashboard and Discord bot need that pure session records don't give directly:

- **Live total wattage** — sum of `power_usage` across all devices where `is_running=true`. Computed in `_devices_payload()` and included in both `GET /devices` and every `/devices/stream` event under `total_current_watts`. So the dashboard can show "Total power right now: 740W" without re-aggregating client-side.
- **Today's kWh** — energy accrued since 00:00 UTC today, summed across every usage row that overlaps today (closed rows clamped to `[today_start, now]`, open rows use `now` as the stop). `_kwh_today_for_device()` does this per-device; `_today_summary()` aggregates everything. Exposed at `GET /usage/today/summary`:
  ```json
  {
    "generated_at": "...",
    "kwh_today": 4.2,
    "cost_today": 0.63,
    "total_current_watts": 740.0,
    "devices": [
      {"name": "Living Room Bulb", "kwh_today": 2.1, "cost_today": 0.315, "is_running": true, ...},
      ...
    ]
  }
  ```

## Real-time updates (SSE)

`GET /devices/stream` is a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) endpoint that pushes the same payload as `/devices` to every connected client.

- The first message is an immediate snapshot of the current state.
- Subsequent messages fire whenever `POST /entry` or `POST /toggle/{ID}` mutates state — they broadcast via an in-process `asyncio.Queue` per subscriber (in `_broadcast()`).
- Format: `data: <json>\n\n`. Standard SSE.
- Each subscriber has its own queue (max 32 messages, oldest dropped if a slow client falls behind) so one stuck client can't block the toggle handler.

Frontend usage:
```js
const es = new EventSource("/devices/stream");
es.onmessage = (e) => {
  const state = JSON.parse(e.data);
  // re-render dashboard
};
```

No polling needed — the browser holds the connection open and the backend pushes the millisecond a toggle lands.

## How to run

```bash
cd backend
PYTHONPATH=.venv/lib/python3.14/site-packages \
  /opt/homebrew/opt/python@3.14/Frameworks/Python.framework/Versions/3.14/bin/python3.14 \
  -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Or hit the OpenAPI docs at `http://localhost:8000/docs` for an interactive playground. On first start, `IOT.db` is created in the backend directory and the schema is built. Stop and restart — data persists.

## Known limitations / out of scope

- **No auth** — anyone on the network can toggle any device.
- **CORS is open** — `CORSMiddleware` is configured with `allow_origins=["*"]` so any frontend can hit the API during development. Before deploying to a shared network, replace this with an explicit allowlist (e.g. `["https://your-dashboard.example.com"]`). The ESP32 makes server-to-server calls and is unaffected by CORS.
- **SSE is in-process** — `_subscribers` lives in the Python process. If you ever run multiple uvicorn workers behind a load balancer, only workers that received the toggle will broadcast to their own subscribers. For a single-worker dev/demo setup this is fine; for multi-worker prod you'd want Redis pub/sub or similar.
- **Single running session per device** — toggle logic assumes there's at most one open `usage` row per device. Toggling while already in a weird state (e.g. flag desyncs from the `usage` table) could leave gaps.
- **No migrations** — schema changes (like the recent `room_number`/`last_usage_datetime` addition) require deleting `IOT.db` for the new columns to take effect.
- **Rate constant is hardcoded** at $0.15/kWh in `config.py`. To make it per-device, add a column to `Device` and read it in `_compute_cost()` and `_kwh_today_for_device()`.