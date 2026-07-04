"use client";

/**
 * Floor plan: a grayscale-styled background image plus three SVG room
 * rectangles for the architectural outline, with HTML <button> overlays
 * (absolutely positioned) providing hover hit-targets and accessibility.
 *
 * If the user hasn't dropped `floorplan.png` into `/public` yet, the
 * <img> 404s; we hide it via onError and only show the SVG grid so the
 * dashboard still looks complete.
 */

import clsx from "clsx";
import { useMemo, useState } from "react";
import { fmtWatts } from "@/lib/format";
import { activeHitboxes, type RoomHitbox } from "@/lib/room";
import { useDevices } from "@/lib/store";
import { Tooltip } from "./Tooltip";

export function FloorPlanMap() {
  const devices = useDevices();

  const rooms = useMemo(() => {
    const totals = new Map<string, { watts: number; on: number; off: number }>();
    for (const d of devices) {
      const acc = totals.get(d.room_number) ?? { watts: 0, on: 0, off: 0 };
      if (d.is_running) {
        acc.watts += d.power_usage;
        acc.on += 1;
      } else {
        acc.off += 1;
      }
      totals.set(d.room_number, acc);
    }
    return totals;
  }, [devices]);

  const knownRooms = useMemo(
    () => Array.from(new Set(devices.map((d) => d.room_number))),
    [devices],
  );
  const hitboxes = activeHitboxes(knownRooms);

  const [imgFailed, setImgFailed] = useState(false);

  return (
    <section className="flex flex-col border border-black bg-white">
      <header className="flex items-center justify-between border-b border-black px-4 py-2">
        <h2 className="font-sans text-[11px] font-bold uppercase tracking-[0.2em] text-black">
          Top-View Layout
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          hover a room → live wattage
        </span>
      </header>

      <div className="relative aspect-[5/3] w-full bg-white">
        {!imgFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/floorplan.png"
            alt="Office floor plan"
            className="absolute inset-0 h-full w-full select-none object-contain grayscale opacity-80"
            onError={() => setImgFailed(true)}
            draggable={false}
          />
        )}

        {/* Architectural outline — pure SVG, decorative only. */}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#000"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1000" height="1000" fill="url(#grid)" />

          {hitboxes.length === 0 && (
            <text
              x="500"
              y="500"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="var(--font-mono), monospace"
              fontSize="22"
              fill="#000"
            >
              NO DEVICES REGISTERED
            </text>
          )}

          {hitboxes.map((box) => (
            <RoomOutline key={box.room} box={box} />
          ))}
        </svg>

        {/* HTML overlay — hit-targets and labels. */}
        {hitboxes.map((box) => {
          const totals = rooms.get(box.room) ?? { watts: 0, on: 0, off: 0 };
          return <RoomHit key={box.room} box={box} totals={totals} />;
        })}

        {imgFailed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="border border-black bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              no /floorplan.png — grid mode
            </span>
          </div>
        )}
      </div>

      <footer className="grid grid-cols-3 gap-px border-t border-black bg-black">
        {hitboxes.map((box) => {
          const totals = rooms.get(box.room) ?? { watts: 0, on: 0, off: 0 };
          return (
            <div key={box.room} className="flex flex-col bg-white px-3 py-2">
              <span className="font-sans text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                {box.room}
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="tabular font-mono text-base font-bold text-black">
                  {fmtWatts(totals.watts)}
                </span>
                <span
                  className={clsx(
                    "border border-black px-1.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                    totals.on > 0
                      ? "bg-emerald-400 text-black"
                      : "bg-white text-neutral-500",
                  )}
                >
                  {totals.on} ON
                </span>
              </div>
            </div>
          );
        })}
      </footer>
    </section>
  );
}

// --- subcomponents ----------------------------------------------------------

function RoomOutline({ box }: { box: RoomHitbox }) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill="rgba(0,0,0,0.02)"
        stroke="#000"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

interface RoomHitProps {
  box: RoomHitbox;
  totals: { watts: number; on: number; off: number };
}

function RoomHit({ box, totals }: RoomHitProps) {
  const label = (
    <span className="font-mono text-[11px] uppercase tracking-widest">
      {box.room} — {fmtWatts(totals.watts)} • {totals.on}/{totals.on + totals.off} ON
    </span>
  );

  // Convert SVG viewBox coords (0..1000) into CSS % via /10.
  const style: React.CSSProperties = {
    left: `${box.x / 10}%`,
    top: `${box.y / 10}%`,
    width: `${box.width / 10}%`,
    height: `${box.height / 10}%`,
  };

  return (
    <div className="absolute" style={style}>
      <Tooltip label={label} className="h-full w-full">
        <button
          type="button"
          aria-label={`${box.room} — ${fmtWatts(totals.watts)}, ${totals.on} of ${totals.on + totals.off} on`}
          className={clsx(
            "group relative h-full w-full border-2 border-black transition-colors duration-100",
            totals.on > 0
              ? "bg-emerald-300/30 hover:bg-emerald-300/50"
              : "bg-white/40 hover:bg-white/70",
          )}
        >
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="font-sans text-xs font-bold uppercase tracking-[0.18em] text-black md:text-base">
              {box.room}
            </span>
            <span
              className={clsx(
                "tabular font-mono text-base font-bold md:text-2xl",
                totals.on > 0 ? "text-black" : "text-neutral-500",
              )}
            >
              {fmtWatts(totals.watts)}
            </span>
          </span>
        </button>
      </Tooltip>
    </div>
  );
}