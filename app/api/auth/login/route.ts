import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, publicOrigin, safeNext } from "@/lib/session";

const ACCOUNTS = (process.env.LARK_ACCOUNTS_BASE || "https://accounts.larksuite.com").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const appId = process.env.LARK_APP_ID;
  if (!appId) return NextResponse.redirect(new URL("/", req.url));

  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  const state = crypto.randomUUID();
  const url = new URL(`${ACCOUNTS}/open-apis/authen/v1/authorize`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next: safeNext(req.nextUrl.searchParams.get("next")) }), {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
