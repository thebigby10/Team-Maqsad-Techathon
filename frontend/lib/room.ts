/**
 * Room grouping + floor-plan geometry.
 *
 * The backend uses `room_number` as a free-form string (e.g. "Work Room 1").
 * We sort rooms numerically when possible, falling back to alphabetical.
 */

import type { DeviceRead } from "./types";

export interface RoomBucket {
  /** Normalized display name (e.g. "Work Room 1"). */
  room: string;
  devices: DeviceRead[];
  /** Sum of power_usage across running devices in this room. */
  liveWatts: number;
  onCount: number;
}

function roomSortKey(room: string): [number, string] {
  // Extract a trailing number for natural ordering: "Work Room 1" -> [1, "Work Room "]
  const match = room.match(/(\d+)\s*$/);
  if (match) return [parseInt(match[1], 10), room];
  return [Number.POSITIVE_INFINITY, room];
}

export function groupByRoom(devices: DeviceRead[]): RoomBucket[] {
  const map = new Map<string, RoomBucket>();
  for (const d of devices) {
    let bucket = map.get(d.room_number);
    if (!bucket) {
      bucket = {
        room: d.room_number,
        devices: [],
        liveWatts: 0,
        onCount: 0,
      };
      map.set(d.room_number, bucket);
    }
    bucket.devices.push(d);
    if (d.is_running) {
      bucket.liveWatts += d.power_usage;
      bucket.onCount += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const [ka, kaStr] = roomSortKey(a.room);
    const [kb, kbStr] = roomSortKey(b.room);
    if (ka !== kb) return ka - kb;
    return kaStr.localeCompare(kbStr);
  });
}

/**
 * Floor-plan hit-boxes. Coordinates are in a 0..1000 viewBox so they map
 * to any rendered size. Hard-coded for 3 rooms; expand as the backend
 * exposes more room_numbers.
 *
 *   +---------------------------+----------------+
 *   |                           |                |
 *   |       Work Room 1         |   Work Room 2  |
 *   |       (x: 20..480)        |   (x: 520..980)|
 *   |                           |                |
 *   +---------------------------+----------------+
 *   |                                          |
 *   |                Lounge                    |
 *   |          (x: 20..980, y: 540..980)       |
 *   |                                          |
 *   +------------------------------------------+
 */
export interface RoomHitbox {
  room: string;
  /** 0..1000 */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ROOM_HITBOXES: RoomHitbox[] = [
  {
    room: "Work Room 1",
    x: 20,
    y: 20,
    width: 460,
    height: 500,
  },
  {
    room: "Work Room 2",
    x: 520,
    y: 20,
    width: 460,
    height: 500,
  },
  {
    room: "Lounge",
    x: 20,
    y: 540,
    width: 960,
    height: 440,
  },
];

/**
 * Fallback when the backend has fewer rooms than hit-boxes — returns only
 * hitboxes that match a known room, so the floor plan doesn't show
 * dead zones.
 */
export function activeHitboxes(knownRooms: string[]): RoomHitbox[] {
  const set = new Set(knownRooms);
  return ROOM_HITBOXES.filter((b) => set.has(b.room));
}