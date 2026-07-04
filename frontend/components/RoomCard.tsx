"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { fmtWatts } from "@/lib/format";
import type { RoomBucket } from "@/lib/room";
import { DevicePill } from "./DevicePill";

interface RoomCardProps {
  bucket: RoomBucket;
}

export function RoomCard({ bucket }: RoomCardProps) {
  const running = bucket.onCount;
  const total = bucket.devices.length;
  return (
    <motion.article
      layout
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex flex-col border border-black bg-white"
    >
      <header className="flex items-start justify-between border-b border-black p-3">
        <div className="flex flex-col">
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
            Room
          </span>
          <h2 className="font-sans text-base font-bold uppercase tracking-tight text-black">
            {bucket.room}
          </h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="border border-black bg-black px-2 py-0.5 font-mono text-[11px] font-bold text-white">
            {fmtWatts(bucket.liveWatts)}
          </span>
          <span
            className={clsx(
              "border border-black px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              running > 0 ? "bg-emerald-400 text-black" : "bg-white text-neutral-500",
            )}
          >
            {running}/{total} ON
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-black p-px">
        {bucket.devices.map((d) => (
          <div key={d.id} className="bg-white">
            <DevicePill device={d} />
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-between border-t border-black bg-neutral-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
        <span>PIN {bucket.devices.map((d) => d.pin).join(" / ")}</span>
        <span>{bucket.devices.reduce((acc, d) => acc + d.power_usage, 0).toFixed(0)}W MAX</span>
      </footer>
    </motion.article>
  );
}