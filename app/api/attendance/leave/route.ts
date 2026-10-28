import { NextResponse, type NextRequest } from "next/server";
import { getAttendance } from "@/lib/attendance";
import { attendanceLeaveDays } from "@/lib/attendanceCore";
import { demoAttendance } from "@/lib/demoAttendance";
import { isLarkConfigured } from "@/lib/lark";
import { authEnabled, SESSION_COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// R02 leave exclusions are available to all signed-in viewers, without HR details.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const now = Date.now();
  const headers = { "Cache-Control": "no-store" };
  const parseDate = (raw: string) => {
    const value = raw.replaceAll("/", "-");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const ms = Date.parse(`${value}T00:00:00+08:00`);
    return Number.isFinite(ms) && new Date(ms + 8 * 3600000).toISOString().slice(0, 10) === value ? ms : NaN;
  };
  const start = params.get("start");
  const end = params.get("end");
  const weekStart = start !== null ? parseDate(start) : Number(params.get("week") ?? NaN);
  const endTime = end !== null ? parseDate(end) : weekStart + 6 * 86400000;
  if (!Number.isFinite(weekStart) || weekStart < now - 400 * 86400000 || weekStart > now + 60 * 86400000 ||
      !Number.isFinite(endTime) || endTime < weekStart || endTime > weekStart + 6 * 86400000) {
    return NextResponse.json({ status: "error", days: {}, error: "參數錯誤" }, { status: 400, headers });
  }
  if (authEnabled() && !await readSession(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ status: "forbidden", days: {} }, { status: 401, headers });
  }
  const demo = params.get("demo") === "1";
  if (!demo && !isLarkConfigured()) return NextResponse.json({ status: "not-connected", days: {} }, { headers });

  const res = demo ? demoAttendance(weekStart, now) : await getAttendance(weekStart, { now });
  return NextResponse.json(res.status === "ok" ? attendanceLeaveDays(res) : { status: res.status, days: {} }, {
    status: res.status === "error" ? 502 : 200, headers,
  });
}
