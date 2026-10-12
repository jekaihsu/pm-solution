import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, publicOrigin } from "@/lib/session";

export async function GET(req: NextRequest) {
  const res = new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>已登出</title><body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px"><h2>已登出</h2><p><a href="${publicOrigin(req.headers, req.nextUrl.origin)}/api/auth/login">使用 Lark 重新登入</a></p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
