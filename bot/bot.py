"""Discord bot: chat interface to the FastAPI power-tracking backend.

Three commands:
    !status       — global overview of every room and what's currently on
    !room <name>  — deep dive on one room (e.g. !room work1)
    !usage        — current total wattage + today's kWh estimate

Each command fetches a JSON snapshot from the backend, hands it to Groq for
humanization, and posts the result. The bot owns no device state of its own.

Run:
    python -m bot          (from inside bot/, with .env populated)
or
    python bot.py
"""

import asyncio
import logging

import discord
from discord.ext import commands

from api import (
    BackendUnavailable,
    filter_devices_by_room,
    get_devices,
    get_usage_today_summary,
)
from config import DISCORD_TOKEN
from llm import humanize

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("bot")

intents = discord.Intents.default()
intents.message_content = True  # required to read command arguments

bot = commands.Bot(command_prefix="!", intents=intents)


# Discord hard cap on message length — the LLM prompt already enforces ~60
# words, but double-check before posting so we never get rate-limited.
_DISCORD_MAX = 1900


async def _send_humanized(ctx: commands.Context, user_context: str, data: dict) -> None:
    """Fetch → humanize → post. Send a friendly fallback on any failure."""
    try:
        reply = await asyncio.to_thread(humanize, user_context, data)
    except BackendUnavailable as exc:
        log.warning("Backend unavailable for %s: %s", ctx.command, exc)
        await ctx.send(
            "I'm having a little trouble reaching the facility backend right now. "
            "Give me a minute and try again."
        )
        return
    except Exception as exc:
        log.exception("Humanization failed for %s: %s", ctx.command, exc)
        await ctx.send(
            "Something went wrong while formatting that update. "
            "The backend is reachable, but the language model choked. Try again in a moment."
        )
        return

    # Defensive truncation — should never trigger, but Discord will reject
    # anything over 2000 chars with a 400.
    if len(reply) > _DISCORD_MAX:
        reply = reply[: _DISCORD_MAX - 1] + "…"
    await ctx.send(reply)


@bot.event
async def on_ready() -> None:
    log.info("Logged in as %s (id=%s)", bot.user, bot.user.id)
    log.info("Connected to %d guild(s)", len(bot.guilds))


@bot.command(name="status", help="Office-wide overview of which devices are on, by room.")
async def status(ctx: commands.Context) -> None:
    """!status — aggregate all devices, grouped by room."""
    try:
        data = await get_devices()
    except BackendUnavailable as exc:
        log.warning("Backend unavailable for !status: %s", exc)
        await ctx.send(
            "I'm having a little trouble reaching the facility backend right now. "
            "Give me a minute and try again."
        )
        return

    if data.get("count", 0) == 0:
        await ctx.send("Nothing is registered with the backend yet, so there's nothing to report.")
        return

    context = (
        "The boss asked for an office-wide status update. Summarize which devices "
        "are currently ON versus OFF, grouped by room. Mention the live total wattage."
    )
    await _send_humanized(ctx, context, data)


@bot.command(name="room", help="Drill into one room. Usage: !room <room_number>")
async def room(ctx: commands.Context, *, room_name: str = "") -> None:
    """!room <name> — narrow the global snapshot to a single room."""
    if not room_name.strip():
        await ctx.send("I need a room name, e.g. `!room work1` or `!room drawing`.")
        return

    try:
        all_devices = await get_devices()
    except BackendUnavailable as exc:
        log.warning("Backend unavailable for !room: %s", exc)
        await ctx.send(
            "I'm having a little trouble reaching the facility backend right now. "
            "Give me a minute and try again."
        )
        return

    sliced = filter_devices_by_room(all_devices, room_name)
    if sliced["count"] == 0:
        # Echo the rooms we do know about so the boss can self-correct.
        known = sorted({
            str(d.get("room_number", "")).strip()
            for d in all_devices.get("devices", [])
            if d.get("room_number")
        })
        known_str = ", ".join(f"`{r}`" for r in known) if known else "_none registered_"
        await ctx.send(
            f"I couldn't find any devices in room `{room_name}`. "
            f"Rooms I do know about: {known_str}."
        )
        return

    context = (
        f"The boss asked specifically about the '{room_name}' room. "
        "List which devices there are ON and which are OFF. "
        "Include the room's current wattage."
    )
    await _send_humanized(ctx, context, sliced)


@bot.command(name="usage", help="Live total wattage + today's estimated kWh.")
async def usage(ctx: commands.Context) -> None:
    """!usage — power analytics: live watts + today's kWh / cost."""
    try:
        data = await get_usage_today_summary()
    except BackendUnavailable as exc:
        log.warning("Backend unavailable for !usage: %s", exc)
        await ctx.send(
            "I'm having a little trouble reaching the facility backend right now. "
            "Give me a minute and try again."
        )
        return

    context = (
        "The boss wants power analytics. Report (1) the total wattage being drawn "
        "right now across the whole office, and (2) today's estimated kWh usage "
        "and dollar cost so far. Keep numbers exact — do not round aggressively."
    )
    await _send_humanized(ctx, context, data)


@bot.event
async def on_command_error(ctx: commands.Context, error: Exception) -> None:
    """Last-resort handler so a typo'd command doesn't silently die."""
    if isinstance(error, commands.CommandNotFound):
        return  # ignore spam
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"Missing argument: `{error.param.name}`. Try `!help`.")
        return
    log.exception("Unhandled command error: %s", error)
    await ctx.send("Something unexpected went wrong handling that command.")


def main() -> None:
    if not DISCORD_TOKEN:
        raise RuntimeError("DISCORD_TOKEN is not set. Populate bot/.env and try again.")
    bot.run(DISCORD_TOKEN, log_handler=None)  # we already configured logging


if __name__ == "__main__":
    main()