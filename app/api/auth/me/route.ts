import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ authEnabled: authEnabled(), user: s ? { name: s.name, avatar: s.avatar, openId: s.openId } : null });
}
