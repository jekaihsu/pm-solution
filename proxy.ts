import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, publicOrigin, readSession } from "@/lib/session";

// Requires a Lark login for every page and API route (except the auth routes).
export async function proxy(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (await readSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ status: "unauthorized", error: "請先登入" }, { status: 401 });

  const login = new URL("/api/auth/login", publicOrigin(req.headers, req.nextUrl.origin));
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api/auth/|_next/static|_next/image|favicon.ico).*)"],
};
