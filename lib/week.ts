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
  return offset < 0 ? `${-offset} 週前` : `${offset} 週後`;
}

export function formatDate(ms: number): string {
  const d = new Date(ms + TZ_OFFSET);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
}
