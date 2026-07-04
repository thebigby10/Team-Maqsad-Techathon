"use client";

import { motion } from "framer-motion";
import { AnimatedNumber } from "./AnimatedNumber";
import { ConnectionBadge } from "./ConnectionBadge";
import { fmtCost, fmtKwh, fmtTime, parseUtc } from "@/lib/format";
import { useSummary, useTotalWatts } from "@/lib/store";

export function PowerHeader() {
  const watts = useTotalWatts();
  const summary = useSummary();
  const generated = parseUtc(summary?.generated_at);

  return (
    <header className="grid grid-cols-1 gap-px bg-black md:grid-cols-[1fr_auto_auto]">
      {/* Live wattage */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex items-center gap-4 bg-white px-5 py-4"
      >
        <span className="hidden font-mono text-xs uppercase tracking-widest text-neutral-500 md:inline">
          {"// live_load"}
        </span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xl leading-none text-neutral-400">[</span>
          <AnimatedNumber
            value={watts}
            suffix="W"
            className="font-mono text-5xl font-bold leading-none tracking-tight text-black md:text-6xl"
          />
          <span className="font-mono text-2xl leading-none text-neutral-400">]</span>
        </div>
      </motion.div>

      {/* Today summary */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="grid grid-cols-3 gap-px bg-black"
      >
        <Stat label="kWh today" value={fmtKwh(summary?.kwh_today ?? 0)} />
        <Stat label="cost today" value={fmtCost(summary?.cost_today ?? 0)} />
        <Stat label="updated" value={fmtTime(generated)} />
      </motion.div>

      {/* Connection badge + brand */}
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="flex items-center justify-end gap-3 bg-white px-5 py-4"
      >
        <div className="hidden text-right md:block">
          <div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            IOT // POWER GRID
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            v1.0 — realtime
          </div>
        </div>
        <ConnectionBadge />
      </motion.div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center bg-white px-4 py-3">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
        {label}
      </span>
      <span className="tabular font-mono text-lg font-bold leading-tight text-black">
        {value}
      </span>
    </div>
  );
}