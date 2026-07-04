/**
 * Zustand store: single source of UI state.
 *
 * The SSE hook is the writer; components are readers. We keep the store
 * deliberately small and selectors cheap.
 */

"use client";

import { create } from "zustand";
import type {
  Alert,
  ConnectionState,
  DeviceRead,
  DevicesPayload,
  UsageTodaySummary,
} from "./types";

interface DashboardState {
  // ---- data ----
  devices: DeviceRead[];
  totalCurrentWatts: number;
  summary: UsageTodaySummary | null;
  alerts: Alert[];
  /** Live device-id → running flag, used by optimistic toggle rollbacks. */
  preToggle: Map<string, boolean> | null;

  // ---- connection ----
  connState: ConnectionState;

  // ---- writers ----
  setDevices: (payload: DevicesPayload) => void;
  setSummary: (summary: UsageTodaySummary | null) => void;
  setAlerts: (alerts: Alert[]) => void;
  setConnState: (state: ConnectionState) => void;
  /** Optimistically flip a single device. */
  optimisticToggle: (deviceId: string) => void;
  /** Roll back after a failed toggle. */
  rollbackToggle: () => void;
}

export const useDashboard = create<DashboardState>((set) => ({
  devices: [],
  totalCurrentWatts: 0,
  summary: null,
  alerts: [],
  preToggle: null,
  connState: "connecting",

  setDevices: (payload) =>
    set({
      devices: payload.devices,
      totalCurrentWatts: payload.total_current_watts,
    }),

  setSummary: (summary) => set({ summary }),

  setAlerts: (alerts) => set({ alerts }),

  setConnState: (connState) => set({ connState }),

  optimisticToggle: (deviceId) =>
    set((state) => {
      // Snapshot the prior state so we can roll back on failure.
      const prev = new Map<string, boolean>();
      const devices = state.devices.map((d) => {
        prev.set(d.id, d.is_running);
        if (d.id !== deviceId) return d;
        return { ...d, is_running: !d.is_running };
      });
      const totalCurrentWatts = devices.reduce(
        (acc, d) => acc + (d.is_running ? d.power_usage : 0),
        0,
      );
      return {
        devices,
        totalCurrentWatts,
        preToggle: prev,
      };
    }),

  rollbackToggle: () =>
    set((state) => {
      const snapshot = state.preToggle;
      if (!snapshot) return state;
      const devices = state.devices.map((d) => {
        const prev = snapshot.get(d.id);
        return prev === undefined ? d : { ...d, is_running: prev };
      });
      const totalCurrentWatts = devices.reduce(
        (acc, d) => acc + (d.is_running ? d.power_usage : 0),
        0,
      );
      return { devices, totalCurrentWatts, preToggle: null };
    }),
}));

// Convenience selector hooks -------------------------------------------------

export function useDevices(): DeviceRead[] {
  return useDashboard((s) => s.devices);
}

export function useTotalWatts(): number {
  return useDashboard((s) => s.totalCurrentWatts);
}

export function useSummary(): UsageTodaySummary | null {
  return useDashboard((s) => s.summary);
}

export function useAlerts(): Alert[] {
  return useDashboard((s) => s.alerts);
}

export function useConnState(): ConnectionState {
  return useDashboard((s) => s.connState);
}