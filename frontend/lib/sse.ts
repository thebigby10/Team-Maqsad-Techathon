"use client";

/**
 * SSE subscription hook. Opens an EventSource against
 * `${NEXT_PUBLIC_API_BASE}/devices/stream` and pushes every payload into
 * the Zustand store. Also kicks off an initial fetch of `/usage/today/summary`
 * and re-fetches it whenever devices change so `open_session_started_at`
 * stays fresh after a toggle.
 *
 * EventSource auto-reconnects; we only surface state to the UI.
 */

import { useEffect, useRef } from "react";
import { getTodaySummary } from "./api";
import { apiBase } from "./api";
import { alertsSignature, deriveAlerts } from "./alerts";
import { useDashboard } from "./store";
import type { DevicesPayload, UsageTodaySummary } from "./types";

export function useDevicesStream(): void {
  const setDevices = useDashboard((s) => s.setDevices);
  const setSummary = useDashboard((s) => s.setSummary);
  const setAlerts = useDashboard((s) => s.setAlerts);
  const setConnState = useDashboard((s) => s.setConnState);

  // Latest derived alerts, kept in a ref so the SSE `onmessage` callback
  // (registered once) can dedupe without re-running the effect.
  const lastAlertsRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const base = apiBase();
    const url = `${base}/devices/stream`;
    setConnState("connecting");

    let es: EventSource | null = null;
    try {
      es = new EventSource(url);
    } catch {
      setConnState("reconnecting");
      return;
    }

    es.onopen = () => {
      if (!cancelled) setConnState("live");
    };

    es.onerror = () => {
      // EventSource fires onerror on every disconnect/reconnect cycle.
      // readyState === 0 means CLOSED (no auto-reconnect) — set
      // reconnecting; otherwise the browser is already reconnecting.
      if (!cancelled && es && es.readyState === EventSource.CLOSED) {
        setConnState("reconnecting");
      } else if (!cancelled) {
        setConnState("reconnecting");
      }
    };

    es.onmessage = (event) => {
      if (cancelled) return;
      let payload: DevicesPayload | null = null;
      try {
        payload = JSON.parse(event.data) as DevicesPayload;
      } catch {
        return;
      }
      if (!payload || !Array.isArray(payload.devices)) return;
      setDevices(payload);

      // Refresh the daily summary so the alert engine has the latest
      // open_session_started_at. Fire-and-forget. Read devices back from
      // the store (not the closure) so concurrent toggles don't race.
      getTodaySummary()
        .then((summary: UsageTodaySummary) => {
          if (cancelled) return;
          setSummary(summary);
          const currentDevices = useDashboard.getState().devices;
          const next = deriveAlerts(currentDevices, summary);
          const sig = alertsSignature(next);
          if (sig !== lastAlertsRef.current) {
            lastAlertsRef.current = sig;
            setAlerts(next);
          }
        })
        .catch(() => {
          // Backend unreachable for summary — keep prior summary, do not
          // clear alerts (they may still be valid).
        });
    };

    // Initial summary fetch on mount, so the header kWh/cost block
    // renders before the first SSE message lands.
    getTodaySummary()
      .then((summary) => {
        if (cancelled) return;
        setSummary(summary);
        const devices = useDashboard.getState().devices;
        const next = deriveAlerts(devices, summary);
        const sig = alertsSignature(next);
        if (sig !== lastAlertsRef.current) {
          lastAlertsRef.current = sig;
          setAlerts(next);
        }
      })
      .catch(() => {
        // First-load fetch may fail if backend is still starting up. SSE
        // reconciliation will retry.
      });

    return () => {
      cancelled = true;
      es?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}