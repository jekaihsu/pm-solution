// Signed session cookie (HMAC-SHA256 via Web Crypto, so it works in proxy and routes).
export const SESSION_COOKIE = "pm_session";
export const STATE_COOKIE = "pm_oauth_state";
export const SESSION_MAX_AGE = 7 * 24 * 3600; // seconds

export interface Session {
  openId: string;
  name: string;
  avatar?: string;
  tenant?: string;
  exp: number; // epoch seconds
}

export function authEnabled(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET) && process.env.AUTH_DISABLED !== "1";
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || `pm-session:${process.env.LARK_APP_SECRET ?? ""}`;
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(s: Omit<Session, "exp">): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

// Public origin of this app (behind Zeabur's proxy the request URL is internal).
export function publicOrigin(headers: Headers, fallback: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  return host ? `${proto}://${host}` : fallback;
}

// Only allow same-site relative paths as post-login targets.
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
