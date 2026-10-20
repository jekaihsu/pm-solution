import { NextResponse, type NextRequest } from "next/server";
import { getLeaveDays } from "@/lib/attendance";
import { demoLeaveDays } from "@/lib/demoAttendance";
import { isLarkConfigured } from "@/lib/lark";
import { hrPermission } from "@/lib/roles";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// 「已請假＝正常」用：所選週內每位同事（人員名單 record_id）請假／出差／外出的日子。
// 經 HR 守門（與出勤同一把鑰匙），只回 record_id 與日期，不含姓名、open_id、employee_id。
export async function GET(req: NextRequest) {
  const week = Number(req.nextUrl.searchParams.get("week"));
  const now = Date.now();
  if (!Number.isFinite(week) || week < now - 400 * 86400000 || week > now + 60 * 86400000) return NextResponse.json({ status: "error", error: "參數錯誤" }, { status: 400 });
  // 自訂日期區間可跨多週，`to`（exclusive ms）決定要抓到哪一週；缺省或不合法時只抓起始週。
  // 超過 now+60d 的區間不是整段丟掉（原本會悄悄退回只抓起始週、卻仍回 ok），而是把結束夾到
  // 上限、照抓到上限那一週，並在回應標 rangeClamped 讓 UI 提示這段區間沒有抓滿。
  const toParam = Number(req.nextUrl.searchParams.get("to"));
  const cap = now + 60 * 86400000;
  let end: number | undefined;
  let rangeClamped = false;
  if (Number.isFinite(toParam) && toParam > week) {
    if (toParam > cap) {
      end = cap;
      rangeClamped = true;
    } else end = toParam;
  }
  const headers = { "Cache-Control": "no-store" };

  if (req.nextUrl.searchParams.get("demo") === "1") return NextResponse.json(demoLeaveDays(week, now), { headers });

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const perm = hrPermission(session);
  if (!perm.canView) return NextResponse.json({ status: "error", error: perm.reason }, { status: 403, headers });
  if (!isLarkConfigured()) return NextResponse.json({ status: "not-connected" }, { headers });

  const res = await getLeaveDays(week, { force: req.nextUrl.searchParams.get("refresh") === "1", now, end });
  if (res.status === "error") console.error("[attendance/leave]", res.error);
  return NextResponse.json(rangeClamped && res.status === "ok" ? { ...res, rangeClamped } : res, { status: res.status === "error" ? 502 : 200, headers });
}
