/**
 * Formatting helpers. Everything is pure — no React state.
 */

/**
 * Backend timestamps arrive naive (SQLite strips tz). We treat them as UTC
 * by appending 'Z' before constructing a Date.
 */
export function parseUtc(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // Already has tz info? leave it.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return new Date(iso);
  return new Date(iso + "Z");
}

export function fmtWatts(w: number): string {
  if (w >= 1000) return `${(w / 1000).toFixed(2)} kW`;
  return `${Math.round(w)} W`;
}

export function fmtKwh(kwh: number): string {
  if (kwh >= 1) return `${kwh.toFixed(2)} kWh`;
  return `${(kwh * 1000).toFixed(0)} Wh`;
}

export function fmtCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(3)}`;
}

export function fmtTime(d: Date | null): string {
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mo}-${dd} ${fmtTime(d)}`;
}

export function elapsedMinutes(start: Date | null, now: Date): number {
  if (!start) return 0;
  return Math.max(0, (now.getTime() - start.getTime()) / 60_000);
}