"use client";

/**
 * Top-level client orchestrator. Mounts the SSE hook and renders the
 * full dashboard grid. Server-side rendered via `app/page.tsx`.
 */

import { useMemo } from "react";
import { groupByRoom } from "@/lib/room";
import { useDevices } from "@/lib/store";
import { useDevicesStream } from "@/lib/sse";
import { AlertsFeed } from "./AlertsFeed";
import { FloorPlanMap } from "./FloorPlanMap";
import { PowerHeader } from "./PowerHeader";
import { RoomCard } from "./RoomCard";

export function DashboardClient() {
  // Subscribe to SSE; this hook is what keeps the store alive.
  useDevicesStream();

  const devices = useDevices();
  const rooms = useMemo(() => groupByRoom(devices), [devices]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-px bg-black">
      <PowerHeader />

      <div className="grid grid-cols-1 gap-px bg-black lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-px bg-black">
          {/* Top: floor plan */}
          <FloorPlanMap />

          {/* Bottom: room grid */}
          <section className="flex flex-col gap-px bg-black p-px">
            <header className="flex items-center justify-between border border-black bg-white px-4 py-2">
              <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-black">
                Rooms
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                {rooms.length} room{rooms.length === 1 ? "" : "s"} • {devices.length} device{devices.length === 1 ? "" : "s"}
              </span>
            </header>

            <div className="grid grid-cols-1 gap-px border border-black bg-black sm:grid-cols-2 xl:grid-cols-3">
              {rooms.map((bucket) => (
                <RoomCard key={bucket.room} bucket={bucket} />
              ))}
            </div>
          </section>
        </section>

        <AlertsFeed />
      </div>

      <footer className="flex items-center justify-between border border-black-0 bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
        <span>{"// connected to sse /devices/stream"}</span>
        <span className="tabular">techathon // power grid</span>
      </footer>
    </main>
  );
}