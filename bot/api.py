"""Thin async client for the FastAPI backend.

The bot never owns device state — it only fetches snapshots and forwards
them to the LLM. Every call here raises BackendUnavailable on network /
timeout errors so the Discord command can degrade gracefully instead of
crashing the bot.
"""

import logging
from typing import Any, Dict

import httpx

from config import API_TIMEOUT, FASTAPI_URL

log = logging.getLogger(__name__)


class BackendUnavailable(RuntimeError):
    """Raised when the FastAPI backend can't be reached or times out."""


async def _get(path: str) -> Dict[str, Any]:
    """GET <FASTAPI_URL><path> and return parsed JSON.

    Translates any network / timeout / non-2xx into BackendUnavailable
    so the caller has a single exception type to handle.
    """
    url = f"{FASTAPI_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException as exc:
        log.warning("Backend timeout on %s: %s", url, exc)
        raise BackendUnavailable(f"timeout reaching {url}") from exc
    except httpx.HTTPError as exc:
        log.warning("Backend HTTP error on %s: %s", url, exc)
        raise BackendUnavailable(f"HTTP error from {url}: {exc}") from exc


async def get_devices() -> Dict[str, Any]:
    """Return the /devices payload: {count, total_current_watts, devices:[...]}."""
    return await _get("/devices")


async def get_usage_today_summary() -> Dict[str, Any]:
    """Return /usage/today/summary: today's kWh, cost, live watts, per-device breakdown."""
    return await _get("/usage/today/summary")


def filter_devices_by_room(devices_payload: Dict[str, Any], room: str) -> Dict[str, Any]:
    """Slice a /devices payload down to a single room.

    Match is case-insensitive and trims whitespace so `!room work1` and
    `!room Work1` both work. Returns a payload in the same shape as
    /devices so the LLM prompt template stays consistent.
    """
    target = room.strip().lower()
    matching = [
        d for d in devices_payload.get("devices", [])
        if str(d.get("room_number", "")).strip().lower() == target
    ]
    live_watts = sum(d["power_usage"] for d in matching if d.get("is_running"))
    return {
        "count": len(matching),
        "total_current_watts": round(live_watts, 2),
        "devices": matching,
    }