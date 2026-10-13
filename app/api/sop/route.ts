import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { listSop, persistent, setSop } from "@/lib/sopStore";
import { sopPermission } from "@/lib/roles";

export const dynamic = "force-dynamic";

// R01 keeps its original keys; other reports are namespaced ("r02:v3").
const scope = (report: string | null | undefined, version: string) => (!report || report === "r01" ? version : `${report}:${version}`);
const validReport = (r: string | null | undefined) => !r || /^r0[12]$/.test(r);

const parse = (req: NextRequest) => ({
  version: req.nextUrl.searchParams.get("version") ?? "",
  report: req.nextUrl.searchParams.get("report"),
  weekStart: Number(req.nextUrl.searchParams.get("week")),
});

export async function GET(req: NextRequest) {
  const { version, report, weekStart } = parse(req);
  if (!/^v[34]$/.test(version) || !validReport(report) || !Number.isFinite(weekStart)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const perm = sopPermission(session);
  try {
    return NextResponse.json({ entries: await listSop(scope(report, version), weekStart), persistent, ...perm, openId: session?.openId });
  } catch (err) {
    return NextResponse.json({ error: `讀取 SOP 紀錄失敗：${(err as Error).message}`, persistent }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { version?: string; report?: string; weekStart?: number; group?: string; groups?: string[]; ok?: boolean } | null;
  const keys = body?.groups ?? (body?.group ? [body.group] : []);
  const validKeys = Array.isArray(keys) && keys.length > 0 && keys.length <= 1000 && keys.every((k) => typeof k === "string" && k.length > 0 && k.length <= 100);
  if (!body || !/^v[34]$/.test(body.version ?? "") || !validReport(body.report) || !Number.isFinite(body.weekStart) || !validKeys || typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const perm = sopPermission(session);
  if (!perm.canEdit) return NextResponse.json({ error: `沒有勾選 SOP 的權限。${perm.reason ?? ""}` }, { status: 403 });
  const by = session?.name ?? "（本機開發）";
  try {
    const entry = await setSop(scope(body.report, body.version!), body.weekStart!, keys, body.ok, by);
    return NextResponse.json({ entry, persistent });
  } catch (err) {
    return NextResponse.json({ error: `儲存失敗：${(err as Error).message}` }, { status: 500 });
  }
}
