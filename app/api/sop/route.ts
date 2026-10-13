import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/session";
import { listSop, persistent, setSop } from "@/lib/sopStore";

export const dynamic = "force-dynamic";

const parse = (req: NextRequest) => ({
  version: req.nextUrl.searchParams.get("version") ?? "",
  weekStart: Number(req.nextUrl.searchParams.get("week")),
});

export async function GET(req: NextRequest) {
  const { version, weekStart } = parse(req);
  if (!/^v[34]$/.test(version) || !Number.isFinite(weekStart)) return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  try {
    return NextResponse.json({ entries: await listSop(version, weekStart), persistent });
  } catch (err) {
    return NextResponse.json({ error: `讀取 SOP 紀錄失敗：${(err as Error).message}`, persistent }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { version?: string; weekStart?: number; group?: string; ok?: boolean } | null;
  if (!body || !/^v[34]$/.test(body.version ?? "") || !Number.isFinite(body.weekStart) || !body.group || typeof body.ok !== "boolean" || body.group.length > 100) {
    return NextResponse.json({ error: "參數錯誤" }, { status: 400 });
  }
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  const by = session?.name ?? "（未登入）";
  try {
    const entry = await setSop(body.version!, body.weekStart!, body.group, body.ok, by);
    return NextResponse.json({ entry, persistent });
  } catch (err) {
    return NextResponse.json({ error: `儲存失敗：${(err as Error).message}` }, { status: 500 });
  }
}
