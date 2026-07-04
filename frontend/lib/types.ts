/**
 * Mirrors `backend/schemas.py`. Keep field names and types aligned.
 *
 * Backend emits naive UTC timestamps; we append 'Z' before constructing
 * Date objects (see `lib/format.ts`).
 */

export interface DeviceRead {
  id: string;
  name: string;
  pin: number;
  is_running: boolean;
  /** Watts. */
  power_usage: number;
  room_number: string;
  last_usage_datetime: string | null;
}

export interface DevicesPayload {
  count: number;
  /** Sum of `power_usage` across devices where `is_running === true`. */
  total_current_watts: number;
  devices: DeviceRead[];
}

export interface DeviceUsageToday {
  device_id: string;
  name: string;
  pin: number;
  room_number: string;
  is_running: boolean;
  kwh_today: number;
  cost_today: number;
  open_session_started_at: string | null;
}

export interface UsageTodaySummary {
  generated_at: string;
  kwh_today: number;
  cost_today: number;
  total_current_watts: number;
  devices: DeviceUsageToday[];
}

export interface ToggleResponse {
  id: string;
  pin: number;
  is_running: boolean;
  /** "running" | "turned_off" */
  status: "running" | "turned_off";
  usage_id: number | null;
  total_cost: number | null;
}

export type AlertSeverity = "info" | "warn" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** ISO 8601, UTC. */
  timestamp: string;
  /** Present when the alert is tied to a specific device. */
  deviceId?: string;
}

export type ConnectionState = "connecting" | "live" | "reconnecting";