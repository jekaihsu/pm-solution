import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, publicOrigin, readSession } from "@/lib/session";

// Requires a Lark login for every page and API route (except the auth routes).
export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname === "/reports/r08" || pathname === "/api/reports/contacts" || /^\/api\/sources\/(?:v3-contact-log|contact-log|v3-cases|v3-people|owner-contacts)$/.test(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ status: "unauthorized", error: "請先登入" }, { status: 401 });

  const login = new URL("/api/auth/login", publicOrigin(req.headers, req.nextUrl.origin));
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/auth/|api/health|_next/static|_next/image|favicon.ico).*)"],
};
