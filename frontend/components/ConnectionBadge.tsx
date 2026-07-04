"use client";

import clsx from "clsx";
import { useConnState } from "@/lib/store";

const LABEL: Record<string, string> = {
  connecting: "CONNECTING",
  live: "LIVE",
  reconnecting: "RECONNECTING",
};

export function ConnectionBadge() {
  const state = useConnState();
  const tone =
    state === "live"
      ? "bg-emerald-400 text-black border-black"
      : state === "connecting"
        ? "bg-white text-black border-black"
        : "bg-red-500 text-white border-black";

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-2 border px-2 py-1 font-mono text-[11px] uppercase tracking-widest",
        tone,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={clsx(
          "h-2 w-2 border border-black",
          state === "live" ? "bg-black" : "bg-white",
        )}
        aria-hidden="true"
      />
      {LABEL[state] ?? "UNKNOWN"}
    </div>
  );
}