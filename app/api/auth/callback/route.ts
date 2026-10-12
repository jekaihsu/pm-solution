import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE, publicOrigin, safeNext, signSession } from "@/lib/session";

const API = (process.env.LARK_API_BASE || "https://open.larksuite.com").replace(/\/$/, "");

function fail(message: string, status = 400) {
  const html = `<!doctype html><meta charset="utf-8"><title>登入失敗</title>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px">
<h2>Lark 登入失敗</h2><p>${message.replace(/[<>&]/g, "")}</p><p><a href="/api/auth/login">重新登入</a></p></body>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code) return fail("已取消授權，或 Lark 沒有回傳授權碼。");

  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(STATE_COOKIE)?.value ?? "{}");
  } catch {}
  if (!state || state !== saved.state) return fail("登入狀態已過期，請重新登入。");

  const origin = publicOrigin(req.headers, req.nextUrl.origin);
  const tokenRes = await fetch(`${API}/open-apis/authen/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.LARK_APP_ID,
      client_secret: process.env.LARK_APP_SECRET,
      code,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
    cache: "no-store",
  });
  const token = await tokenRes.json();
  if (token.code !== 0 || !token.access_token) {
    console.error("[auth] token exchange failed", token.code, token.error_description ?? token.msg);
    return fail(`無法取得登入憑證（${token.code}）。`, 502);
  }

  const infoRes = await fetch(`${API}/open-apis/authen/v1/user_info`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: "no-store",
  });
  const info = await infoRes.json();
  if (info.code !== 0 || !info.data?.open_id) {
    console.error("[auth] user_info failed", info.code, info.msg);
    return fail(`無法取得使用者資料（${info.code}）。`, 502);
  }

  const allowedTenant = process.env.LARK_TENANT_KEY;
  if (allowedTenant && info.data.tenant_key !== allowedTenant) return fail("此帳號不屬於本組織。", 403);

  const session = await signSession({
    openId: info.data.open_id,
    name: info.data.name || info.data.en_name || "Lark 使用者",
    avatar: info.data.avatar_thumb || info.data.avatar_url,
    tenant: info.data.tenant_key,
  });
  console.log(`[auth] login ${info.data.open_id} tenant=${info.data.tenant_key}`);

  const res = NextResponse.redirect(new URL(safeNext(saved.next), origin));
  res.cookies.set(SESSION_COOKIE, session, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE });
  res.cookies.delete(STATE_COOKIE);
  return res;
}
