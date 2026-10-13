import { NextResponse, type NextRequest } from "next/server";
import { getAttendance } from "@/lib/attendance";
import { demoAttendance } from "@/lib/demo";
import { isLarkConfigured } from "@/lib/lark";
import { hrPermission } from "@/lib/roles";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// 出勤／出差（Lark 假勤）。week＝該週任一時間點（epoch ms，台北週一到週日）。
// 只回白名單欄位（見 lib/attendanceCore.ts）；權限沒開回 {status:"needs-permission", missing, hint}。
export async function GET(req: NextRequest) {
  const week = Number(req.nextUrl.searchParams.get("week"));
  const now = Date.now();
  if (!Number.isFinite(week) || week < now - 400 * 86400000 || week > now + 60 * 86400000) return NextResponse.json({ status: "error", error: "參數錯誤" }, { status: 400 });
  const headers = { "Cache-Control": "no-store" };

  if (req.nextUrl.searchParams.get("demo") === "1") return NextResponse.json(demoAttendance(week, now), { headers });

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const perm = hrPermission(session);
  if (!perm.canView) return NextResponse.json({ status: "forbidden", error: perm.reason, openId: session?.openId }, { status: 403, headers });
  if (!isLarkConfigured()) return NextResponse.json({ status: "not-connected" }, { headers });

  const res = await getAttendance(week, { force: req.nextUrl.searchParams.get("refresh") === "1", now });
  if (res.status === "error") console.error("[attendance]", res.error);
  return NextResponse.json(res, { status: res.status === "error" ? 502 : 200, headers });
}
