/**
 * Pure alert derivation. Called on every SSE message + summary refresh.
 *
 * Alerts are deduped by `key` (a stable string per rule+device). When the
 * set of active keys changes, the alerts feed gets a new array; otherwise
 * it's the same reference and React skips re-renders.
 */

import { elapsedMinutes, parseUtc } from "./format";
import type {
  Alert,
  AlertSeverity,
  DeviceRead,
  UsageTodaySummary,
} from "./types";

// --- tuning -----------------------------------------------------------------

/** Total current watts above which we surface a HIGH_LOAD warning. */
const HIGH_LOAD_THRESHOLD_W = 600;

/** Devices running longer than this become LONG_RUN warnings. */
const LONG_RUN_MINUTES = 4 * 60;

/** Local-time window when LATE_NIGHT alerts can fire. */
const LATE_NIGHT_START_HOUR = 22;
const LATE_NIGHT_END_HOUR = 5;

/** cost_today > COST_SPIKE_USD becomes an info alert. */
const COST_SPIKE_USD = 1.0;

// --- rule scaffolding -------------------------------------------------------

interface RuleHit {
  key: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  deviceId?: string;
}

function ruleHighLoad(totalWatts: number): RuleHit | null {
  if (totalWatts <= HIGH_LOAD_THRESHOLD_W) return null;
  return {
    key: "HIGH_LOAD",
    severity: "warn",
    title: "High aggregate load",
    body: `Live draw ${totalWatts.toFixed(0)}W exceeds ${HIGH_LOAD_THRESHOLD_W}W threshold.`,
  };
}

function ruleLateNight(devices: DeviceRead[], now: Date): RuleHit | null {
  const hour = now.getHours();
  const inWindow =
    hour >= LATE_NIGHT_START_HOUR || hour < LATE_NIGHT_END_HOUR;
  if (!inWindow) return null;
  const running = devices.filter((d) => d.is_running);
  if (running.length === 0) return null;
  return {
    key: "LATE_NIGHT",
    severity: "info",
    title: "Devices on after hours",
    body: `${running.length} device${running.length === 1 ? "" : "s"} still running during late-night window (${LATE_NIGHT_START_HOUR}:00–${LATE_NIGHT_END_HOUR}:00).`,
  };
}

function ruleCostSpike(summary: UsageTodaySummary | null): RuleHit | null {
  if (!summary) return null;
  if (summary.cost_today <= COST_SPIKE_USD) return null;
  return {
    key: "COST_SPIKE",
    severity: "info",
    title: "Daily cost spike",
    body: `Today's accrued cost $${summary.cost_today.toFixed(2)} exceeds $${COST_SPIKE_USD.toFixed(2)}.`,
  };
}

function ruleLongRun(
  devices: DeviceRead[],
  summary: UsageTodaySummary | null,
  now: Date,
): RuleHit[] {
  const hits: RuleHit[] = [];
  // Use open_session_started_at from the summary when available — it
  // reflects what the backend considers the running session. Fall back to
  // device.last_usage_datetime.
  const startedById = new Map<string, Date>();
  if (summary) {
    for (const d of summary.devices) {
      const dt = parseUtc(d.open_session_started_at);
      if (dt) startedById.set(d.device_id, dt);
    }
  }
  for (const d of devices) {
    if (!d.is_running) continue;
    const started =
      startedById.get(d.id) ?? parseUtc(d.last_usage_datetime);
    if (!started) continue;
    const mins = elapsedMinutes(started, now);
    if (mins < LONG_RUN_MINUTES) continue;
    hits.push({
      key: `LONG_RUN:${d.id}`,
      severity: "warn",
      title: `${d.name} running ${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`,
      body: `Device has been continuously on for ${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m — consider switching off.`,
      deviceId: d.id,
    });
  }
  return hits;
}

function ruleStaleSession(
  devices: DeviceRead[],
  summary: UsageTodaySummary | null,
): RuleHit[] {
  // Backend flag says running but the summary doesn't show an open session.
  // This catches the desync case documented in backend/overview.md.
  if (!summary) return [];
  const openSessionIds = new Set(
    summary.devices
      .filter((d) => d.open_session_started_at != null)
      .map((d) => d.device_id),
  );
  const hits: RuleHit[] = [];
  for (const d of devices) {
    if (!d.is_running) continue;
    if (openSessionIds.has(d.id)) continue;
    hits.push({
      key: `STALE_SESSION:${d.id}`,
      severity: "critical",
      title: `${d.name} — flag/session desync`,
      body: `Device is marked ON but has no open usage row. Backend may need a refresh.`,
      deviceId: d.id,
    });
  }
  return hits;
}

// --- entry point ------------------------------------------------------------

/**
 * Compute the active alerts for the current tick. Returns an empty array
 * if nothing fires. Order: critical → warn → info, oldest first within
 * each bucket.
 */
export function deriveAlerts(
  devices: DeviceRead[],
  summary: UsageTodaySummary | null,
  now: Date = new Date(),
): Alert[] {
  const hits: RuleHit[] = [];

  hits.push(...ruleStaleSession(devices, summary));
  hits.push(...ruleLongRun(devices, summary, now));

  const highLoad = ruleHighLoad(devices.reduce(
    (acc, d) => acc + (d.is_running ? d.power_usage : 0),
    0,
  ));
  if (highLoad) hits.push(highLoad);

  const lateNight = ruleLateNight(devices, now);
  if (lateNight) hits.push(lateNight);

  const costSpike = ruleCostSpike(summary);
  if (costSpike) hits.push(costSpike);

  const severityOrder: Record<AlertSeverity, number> = {
    critical: 0,
    warn: 1,
    info: 2,
  };

  hits.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const isoNow = now.toISOString();
  return hits.map((h, idx) => ({
    id: `${h.key}:${idx}`,
    severity: h.severity,
    title: h.title,
    body: h.body,
    timestamp: isoNow,
    deviceId: h.deviceId,
  }));
}

/**
 * Returns a stable string signature of an alerts list so callers can
 * detect "no meaningful change" between two derivations and skip Zustand
 * writes.
 */
export function alertsSignature(
  alerts: Pick<Alert, "severity" | "title" | "body" | "deviceId">[],
): string {
  return alerts
    .map((a) => `${a.severity}|${a.title}|${a.body}|${a.deviceId ?? ""}`)
    .sort()
    .join("§");
}