// Business weeks run Monday–Sunday in Asia/Taipei (UTC+8, no DST).
const TZ_OFFSET = 8 * 3600000;
const DAY = 86400000;

export interface WeekRange {
  offset: number; // 0 = this week, -1 = last week …
  start: number; // inclusive, epoch ms
  end: number; // exclusive
  label: string;
}

export function weekRange(offset: number, now = Date.now()): WeekRange {
  const local = now + TZ_OFFSET;
  const dayIdx = (new Date(local).getUTCDay() + 6) % 7; // Monday = 0
  const mondayLocal = Math.floor(local / DAY) * DAY - dayIdx * DAY + offset * 7 * DAY;
  const start = mondayLocal - TZ_OFFSET;
  const fmt = (ms: number) => {
    const d = new Date(ms + TZ_OFFSET);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  return { offset, start, end: start + 7 * DAY, label: `${fmt(start)}–${fmt(start + 6 * DAY)}` };
}

export function weekName(offset: number): string {
  if (offset === 0) return "本週";
  if (offset === -1) return "上週";
  if (offset === 1) return "下週";
  return offset < 0 ? `${-offset} 週前` : `${offset} 週後`;
}

// How far forward the week picker may go (next-week review etc.). Kept within the
// attendance API's +60-day guard so a shared ?week= link still resolves.
export const MAX_FORWARD_WEEKS = 8;

// ISO-8601 week string (YYYY-Www) for the Taipei Monday of the week starting at `ms`.
// Weeks are Mon–Sun in both our model and ISO, so the number matches; the year is the
// ISO week-year (the year owning that week's Thursday), which can differ near Jan 1.
export function isoWeek(ms: number): string {
  const local = new Date(ms + TZ_OFFSET);
  // Treat the UTC fields of the shifted date as Taipei local wall-clock.
  const thursday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const dow = (new Date(thursday).getUTCDay() + 6) % 7; // Mon = 0
  const thu = thursday - dow * DAY + 3 * DAY; // Thursday of this week
  const year = new Date(thu).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4);
  const week1Thu = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + 3 * DAY;
  const week = 1 + Math.round((thu - week1Thu) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Parse a YYYY-Www param into a week offset relative to the current week (0 = this week).
// Returns null when the string is malformed; the offset is clamped by the caller.
export function weekParamToOffset(param: string | null | undefined, now = Date.now()): number | null {
  const m = /^(\d{4})-W(\d{2})$/.exec((param ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY; // Monday of ISO week 1 (local-as-UTC)
  const mondayLocal = week1Monday + (week - 1) * 7 * DAY;
  const start = mondayLocal - TZ_OFFSET;
  return Math.round((start - weekRange(0, now).start) / (7 * DAY));
}

export function formatDate(ms: number): string {
  const d = new Date(ms + TZ_OFFSET);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}
