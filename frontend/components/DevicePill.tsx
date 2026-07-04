"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { toggleDevice } from "@/lib/api";
import type { DeviceRead } from "@/lib/types";

interface DevicePillProps {
  device: DeviceRead;
}

export function DevicePill({ device }: DevicePillProps) {
  const onClick = async () => {
    try {
      // Fire the toggle. The backend broadcasts the new state via SSE,
      // which flows into the Zustand store and re-renders this pill —
      // single source of truth, no speculative local mutation.
      await toggleDevice(device.id);
    } catch (err) {
      console.error("Failed to toggle device:", err);
    }
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      aria-pressed={device.is_running}
      aria-label={`${device.name} — ${device.is_running ? "ON" : "OFF"}`}
      className={clsx(
        "group flex items-center justify-between gap-2 border border-black px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors",
        device.is_running
          ? "bg-emerald-400 text-black hover:bg-emerald-300"
          : "bg-white text-neutral-500 hover:bg-neutral-100",
      )}
    >
      <span className="truncate">{formatName(device.name)}</span>
      <span
        className={clsx(
          "border border-black px-1.5 py-0.5 text-[10px] font-bold",
          device.is_running ? "bg-black text-white" : "bg-white text-black",
        )}
      >
        {device.is_running ? "ON" : "OFF"}
      </span>
    </motion.button>
  );
}

/**
 * Strip the trailing pin number if the device name embeds one, so the pill
 * doesn't repeat information already in the layout. Keeps FAN_01/02 style
 * names intact.
 */
function formatName(name: string): string {
  return name
    .replace(/\s*\(pin\s*\d+\)/i, "")
    .replace(/\s*#\d+\s*$/, "")
    .trim();
}