import { NextResponse, type NextRequest } from "next/server";

// Optional HTTP Basic Auth for the whole site, enabled when DASHBOARD_PASSWORD is set.
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();

  const user = process.env.DASHBOARD_USER || "admin";
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(/:(.*)/s);
    if (u === user && p === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="PM Dashboard", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
