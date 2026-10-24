import { NextResponse, type NextRequest } from "next/server";
import { getDailyStatus } from "@/lib/attendance";
import { demoDailyStatus } from "@/lib/demoAttendance";
import { isLarkConfigured } from "@/lib/lark";
import { hrPermission } from "@/lib/roles";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// 每日檢查（item 3）：所選週內每位同事的請假／出差／外出日、有效打卡日，與是否考勤組成員。
// 經 HR 守門，只回 record_id 與日期，不含姓名、open_id、employee_id、打卡時間。
export async function GET(req: NextRequest) {
  const week = Number(req.nextUrl.searchParams.get("week"));
  const now = Date.now();
  if (!Number.isFinite(week) || week < now - 400 * 86400000 || week > now + 60 * 86400000) return NextResponse.json({ status: "error", error: "參數錯誤" }, { status: 400 });
  const headers = { "Cache-Control": "no-store" };

  if (req.nextUrl.searchParams.get("demo") === "1") return NextResponse.json(demoDailyStatus(week, now), { headers });

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const perm = hrPermission(session);
  if (!perm.canView) return NextResponse.json({ status: "error", error: perm.reason }, { status: 403, headers });
  if (!isLarkConfigured()) return NextResponse.json({ status: "not-connected" }, { headers });

  const res = await getDailyStatus(week, { force: req.nextUrl.searchParams.get("refresh") === "1", now });
  if (res.status === "error") console.error("[attendance/daily]", res.error);
  return NextResponse.json(res, { status: res.status === "error" ? 502 : 200, headers });
}
