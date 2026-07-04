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
| `GET` | `/devices` | List all devices |
| `GET` | `/usage/{ID}` | Usage history for a device |

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
  → returns ToggleResponse(is_running=true, usage_id=1, status="running", total_cost=null)

POST /toggle/3   (1 second later)
  → is_running flips: true -> false
  → finds the running Usage row
  → sets stop=now, status="turned_off", total_cost = 60W × 1s × 0.15/3600 ≈ 0.000009
  → returns ToggleResponse(is_running=false, usage_id=1, status="turned_off", total_cost=9e-6)
```

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
- **Single running session per device** — toggle logic assumes there's at most one open `usage` row per device. Toggling while already in a weird state (e.g. flag desyncs from the `usage` table) could leave gaps.
- **No migrations** — schema changes (like the recent `room_number`/`last_usage_datetime` addition) require deleting `IOT.db` for the new columns to take effect.
- **Rate constant is hardcoded** at $0.15/kWh in `config.py`. To make it per-device, add a column to `Device` and read it in `_compute_cost()`.