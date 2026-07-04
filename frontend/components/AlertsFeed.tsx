"use client";

/**
 * Terminal-style alerts feed. Slides in from the right with a snappy
 * hard-stop spring. Each entry is high-contrast:
 *
 *   CRITICAL -> red bar
 *   WARN     -> black bar
 *   INFO     -> neutral bar
 *
 * The newest alert stays on top.
 */

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { fmtTime, parseUtc } from "@/lib/format";
import { useAlerts } from "@/lib/store";
import type { Alert, AlertSeverity } from "@/lib/types";

const TONE: Record<AlertSeverity, { bar: string; text: string; chip: string }> = {
  info: {
    bar: "bg-neutral-200",
    text: "text-neutral-700",
    chip: "bg-white text-black border-black",
  },
  warn: {
    bar: "bg-black",
    text: "text-black",
    chip: "bg-black text-white border-black",
  },
  critical: {
    bar: "bg-red-500",
    text: "text-white",
    chip: "bg-red-500 text-white border-black",
  },
};

export function AlertsFeed() {
  const alerts = useAlerts();
  const [now, setNow] = useState<Date>(() => new Date());

  // We don't need a fast tick — alerts compute their own timestamps, but
  // we re-render once a minute so the "elapsed since" footer feels live.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <aside className="flex h-full flex-col border border-black bg-white">
      <header className="flex items-center justify-between border-b border-black px-4 py-2">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-black">
          Alerts
        </h2>
        <span className="border border-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
          {alerts.length} active
        </span>
      </header>

      <div className="relative flex-1 overflow-y-auto bg-white">
        <AnimatePresence initial={false}>
          {alerts.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="flex h-full items-center justify-center px-4 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-neutral-500"
            >
              {"// no active alerts"}
            </motion.div>
          )}

          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
        </AnimatePresence>
      </div>

      <footer className="flex items-center justify-between border-t border-black bg-neutral-50 px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{"// derived client-side"}</span>
        <span className="tabular">{fmtTime(now)}</span>
      </footer>
    </aside>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const tone = TONE[alert.severity];
  const ts = parseUtc(alert.timestamp);
  return (
    <motion.div
      layout
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className="flex border-b border-neutral-200 last:border-b-0"
    >
      <span className={clsx("w-1 shrink-0", tone.bar)} aria-hidden="true" />
      <div className={clsx("flex-1 px-3 py-2", tone.text)}>
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest">
          <span
            className={clsx(
              "border px-1.5 py-0.5 text-[9px] font-bold",
              tone.chip,
            )}
          >
            {alert.severity}
          </span>
          <span className="tabular text-neutral-500">{fmtTime(ts)}</span>
        </div>
        <p className="mt-1 font-sans text-sm font-bold leading-tight text-black">
          {alert.title}
        </p>
        <p className="mt-0.5 font-mono text-[11px] leading-snug text-neutral-700">
          {alert.body}
        </p>
      </div>
    </motion.div>
  );
}