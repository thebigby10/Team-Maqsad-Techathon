/**
 * Typed fetchers for the FastAPI backend.
 *
 * Base URL is read from `NEXT_PUBLIC_API_BASE` at build time. In dev,
 * default to http://localhost:8000.
 */

import type {
  DevicesPayload,
  ToggleResponse,
  UsageTodaySummary,
} from "./types";

const DEFAULT_BASE = "http://localhost:8000";

/**
 * Header sent on every API request. Required when the backend is exposed
 * via localtunnel/ngrok (the tunnel serves a warning HTML page otherwise);
 * harmless on direct localhost calls (FastAPI just ignores it). Matches
 * the pattern used by the ESP32 sketch in `hardware/sketch.ino`.
 */
const TUNNEL_BYPASS_HEADER = {
  "Bypass-Tunnel-Reminder": "true",
} as const;

function apiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE?.trim().replace(/\/+$/, "") ||
    DEFAULT_BASE;
  return raw || DEFAULT_BASE;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function jsonFetch<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${apiBase()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...TUNNEL_BYPASS_HEADER,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body?.detail) detail = body.detail;
      } catch {
        // body wasn't JSON; keep statusText
      }
      throw new ApiError(res.status, `${res.status} ${detail}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getDevices(): Promise<DevicesPayload> {
  return jsonFetch<DevicesPayload>("/devices");
}

export async function getTodaySummary(): Promise<UsageTodaySummary> {
  return jsonFetch<UsageTodaySummary>("/usage/today/summary");
}

export async function toggleDevice(
  identifier: string,
): Promise<ToggleResponse> {
  return jsonFetch<ToggleResponse>(`/toggle/${encodeURIComponent(identifier)}`, {
    method: "POST",
  });
}

export { ApiError, apiBase };