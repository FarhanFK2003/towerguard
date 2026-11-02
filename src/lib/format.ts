import { isIsoDate } from "@/lib/dates";

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable binary size, e.g. `1536` → `"1.5 KB"`. Invalid input → `"—"`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** Fraction in [0, 1] as a whole-number percentage string. */
export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const clamped = Math.min(Math.max(fraction, 0), 1);
  if (clamped > 0 && clamped < 0.01) return "<1%";
  return `${Math.round(clamped * 100)}%`;
}

// Calendar dates have no time zone, so format them in UTC to avoid off-by-one shifts.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `2026-11-02` → `"2 Nov 2026"`. Unrecognised input is returned unchanged. */
export function formatIsoDate(date: string): string {
  if (!isIsoDate(date)) return date;
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

/** ISO timestamp in the user's local time zone. Unrecognised input is returned unchanged. */
export function formatTimestamp(timestamp: string): string {
  const ms = Date.parse(timestamp);
  return Number.isNaN(ms) ? timestamp : TIMESTAMP_FORMAT.format(ms);
}
