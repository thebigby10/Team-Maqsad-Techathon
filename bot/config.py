"""Runtime configuration for the Discord bot.

Reads from environment variables (or a local .env file). Values are validated
on import; the bot will refuse to start if required secrets are missing.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the bot/ directory regardless of where the process is invoked.
_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(_ENV_PATH)


class ConfigError(RuntimeError):
    """Raised when a required configuration value is missing or invalid."""


def _required(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ConfigError(
            f"Missing required environment variable: {name}. "
            f"Set it in {_ENV_PATH} or in your shell."
        )
    return value


# Discord bot token from the Discord Developer Portal.
DISCORD_TOKEN: str = _required("DISCORD_TOKEN")

# Groq API key (https://console.groq.com/keys) for LLM humanization.
GROQ_API_KEY: str = _required("GROQ_API_KEY")

# Groq model name. llama-3.3-70b-versatile is the current default and
# strikes a good balance of quality and latency for short chat replies.
GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Backend URL. Defaults to a local FastAPI dev server; swap for your
# public tunnel URL (e.g. localturt, ngrok) when running off-machine.
FASTAPI_URL: str = os.getenv("FASTAPI_URL", "http://127.0.0.1:8000").rstrip("/")

# Network timeouts (seconds) for backend API calls.
API_TIMEOUT: float = float(os.getenv("API_TIMEOUT", "10"))

# Max LLM tokens for the humanized reply — keeps Discord messages concise.
LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", "300"))