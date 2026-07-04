# POWER GRID — Frontend

A real-time dashboard for the IoT office power tracker. Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS v3.4**, **Framer Motion**, and **Zustand**.

## Aesthetic

High-contrast system monitor. Stark white canvas, 1px black borders, monospace live data (JetBrains Mono), Inter for labels. Sharp spring animations. No drop shadows, no gradients, no rounded corners.

## Run it

```bash
cd /Users/thebigby01/Developer/techathon/frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE=http://localhost:8000
npm install
npm run dev                        # http://localhost:3000
```

The backend (`/Users/thebigby01/Developer/techathon/backend`) must be running on port 8000. The dashboard reads `/devices/stream` (SSE) for live state and `/usage/today/summary` for kWh/cost.

## Floor-plan image

Drop a `floorplan.png` into `public/` and the top-view map will pick it up automatically and apply a `grayscale opacity-80` filter. If the file is missing the dashboard still renders in "grid mode" using only the SVG outlines — no broken-image icon.

The room hit-boxes (`lib/room.ts`) assume three rooms by default: **Work Room 1**, **Work Room 2**, **Lounge**. Adjust the `ROOM_HITBOXES` array there to add or rearrange rooms; unused rooms are filtered out automatically.

## Layout

```
frontend/
├── app/
│   ├── layout.tsx         # Inter + JetBrains Mono via next/font
│   ├── page.tsx           # RSC shell → <DashboardClient />
│   └── globals.css
├── components/            # All "use client"
│   ├── DashboardClient.tsx
│   ├── PowerHeader.tsx        # [ 740W ] live wattage + kWh/cost
│   ├── FloorPlanMap.tsx       # /floorplan.png + SVG + HTML hit-targets
│   ├── RoomCard.tsx           # one card per room
│   ├── DevicePill.tsx         # ON/OFF pill with optimistic toggle
│   ├── AlertsFeed.tsx         # right-rail terminal alerts
│   ├── AnimatedNumber.tsx     # layout-animated digits
│   ├── Tooltip.tsx            # instant black tooltip
│   └── ConnectionBadge.tsx    # LIVE / RECONNECTING pill
├── lib/
│   ├── api.ts             # typed fetchers
│   ├── sse.ts             # useDevicesStream() hook
│   ├── store.ts           # Zustand state
│   ├── types.ts           # mirrors backend/schemas.py
│   ├── alerts.ts          # client-side alert derivation
│   ├── room.ts            # groupByRoom + ROOM_HITBOXES
│   └── format.ts          # date/watts/kWh helpers
└── public/floorplan.png   # (you provide)
```

## How it talks to the backend

| Concern | Endpoint | Mechanism |
|---|---|---|
| Live state of every device | `GET /devices/stream` | SSE — first message is the snapshot, then on every toggle/register |
| Today's kWh / cost per device | `GET /usage/today/summary` | fetched on every SSE message so `open_session_started_at` is fresh |
| Toggle a device | `POST /toggle/{id|pin}` | optimistic local flip + rollback on error; SSE reconciles within ms |

`lib/sse.ts` opens one `EventSource` per page load. The browser auto-reconnects on disconnect; `ConnectionBadge` surfaces state (`CONNECTING` / `LIVE` / `RECONNECTING`).

## Alerts (client-side only)

`lib/alerts.ts` derives alerts from each SSE message + summary refresh. Rules:

1. **HIGH_LOAD** — total live watts > 600W (warn)
2. **LONG_RUN** — a device has been continuously on > 4 hours (warn)
3. **LATE_NIGHT** — any device on between 22:00 and 05:00 local (info)
4. **STALE_SESSION** — flag says running but no open usage row (critical)
5. **COST_SPIKE** — today's cost > $1.00 (info)

Alerts are deduped by a stable signature so the same alert doesn't re-fire on every SSE ping. Tune thresholds in `lib/alerts.ts`.

## Out of scope (v1)

- Auth, multi-user state.
- Per-device history charts (data is available at `/usage/{id}`).
- Persistent alert acknowledgement.
- Multi-worker SSE (the backend currently broadcasts in-process).