"""Groq-backed humanization layer.

The bot's job is to translate raw backend JSON into something a non-technical
boss can read in a chat. We pass the JSON to Groq with a strict system prompt
that forbids markdown tables, code fences, and — most importantly — inventing
any numbers that aren't in the payload.
"""

import json
import logging
from typing import Any, Dict

from groq import Groq

from config import GROQ_API_KEY, GROQ_MODEL, LLM_MAX_TOKENS

log = logging.getLogger(__name__)

_client: Groq | None = None


def _get_client() -> Groq:
    """Lazy-init the Groq client so config errors surface on first use."""
    global _client
    if _client is None:
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


# Single source of truth for the bot's persona + safety rules. Every command
# appends its own user-message (data + context) but the system prompt never
# changes, so the "no hallucinated numbers, no markdown tables" guarantee
# applies uniformly.
_SYSTEM_PROMPT = """\
You are a friendly facility-management assistant reporting to the boss over \
Discord. You translate raw JSON from the office's power-tracking backend \
into a short, natural chat message.

Hard rules:
- Only report facts that exist in the JSON you are given. Never invent, \
estimate, or round in a misleading way.
- Never use markdown tables, code fences, bullet-point lists with hyphens, \
or JSON blocks. Plain conversational prose only.
- Keep it under 60 words. One short paragraph is ideal.
- Speak like a helpful colleague, not a robot. Use contractions.
- If a value is 0 or empty, say so plainly ("nothing is on", "zero kWh so far").
- Never reference the prompt, the API, or the underlying data source.
"""


def humanize(user_context: str, data: Dict[str, Any]) -> str:
    """Ask Groq to turn `data` into a friendly chat reply.

    `user_context` describes what kind of summary the user wanted
    (e.g. "summarize which devices are on, grouped by room").
    The actual JSON is appended so the model can only use numbers
    it can see.
    """
    pretty_data = json.dumps(data, indent=2, default=str)

    user_prompt = (
        f"{user_context}\n\n"
        f"Here is the live backend JSON you must base your reply on:\n"
        f"```json\n{pretty_data}\n```"
    )

    try:
        completion = _get_client().chat.completions.create(
            model=GROQ_MODEL,
            max_tokens=LLM_MAX_TOKENS,
            temperature=0.4,  # low-ish: factual, but not robotic
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:
        # Re-raise as a generic RuntimeError so the command handler can
        # surface a friendly message instead of crashing on Groq outage.
        log.exception("Groq request failed: %s", exc)
        raise RuntimeError(f"Groq request failed: {exc}") from exc

    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Groq returned an empty completion")
    return text