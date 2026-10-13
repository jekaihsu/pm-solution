import { NextResponse, type NextRequest } from "next/server";
import { getSourceData, isLarkConfigured, lastGood, sourceCacheKey } from "@/lib/lark";
import { demoSourceData, hasDemo } from "@/lib/demo";
import { isLocated, sourceByKey } from "@/lib/reports";
import type { TableData } from "@/lib/types";
import { hrPermission } from "@/lib/roles";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Trims a table to what a page needs. The full table stays in the server cache;
// only the response gets smaller.
//  only=meta   → field list and counts, no records (sources page)
//  only=dates  → date fields only (overview trend counts)
//  fields=a,b  → those names ("#fld…" = by field id); "x*" matches a prefix, "~x" any name containing x
//                (case-insensitive), "@dates" every date field
//  links=1     → also return each link field's record_ids (record.links); off by default
function project(data: TableData, req: NextRequest): TableData {
  const wantLinks = req.nextUrl.searchParams.get("links") === "1";
  const out = project0(data, req);
  return {
    ...out,
    records: out.records.map((r) => {
      const { links, ...rest } = r;
      if (!wantLinks || !links) return rest;
      const kept = Object.fromEntries(Object.entries(links).filter(([name]) => out.fields.some((f) => f.name === name)));
      return Object.keys(kept).length ? { ...rest, links: kept } : rest;
    }),
  };
}

function project0(data: TableData, req: NextRequest): TableData {
  const only = req.nextUrl.searchParams.get("only");
  const list = req.nextUrl.searchParams.get("fields");
  if (only === "meta") return { ...data, records: [] };
  if (!only && !list) return data;
  const tokens = list ? list.split(",") : [];
  const exact = new Set(tokens.filter((t) => !t.endsWith("*") && !t.startsWith("@") && !t.startsWith("~") && !t.startsWith("#")));
  const prefixes = tokens.filter((t) => t.endsWith("*")).map((t) => t.slice(0, -1));
  const contains = tokens.filter((t) => t.startsWith("~")).map((t) => t.slice(1).toLowerCase());
  const ids = new Set(tokens.filter((t) => t.startsWith("#")).map((t) => t.slice(1)));
  const allDates = only === "dates" || tokens.includes("@dates");
  const fields = data.fields.filter(
    (f) => (allDates && f.kind === "date") || exact.has(f.name) || ids.has(f.id) || prefixes.some((p) => f.name.startsWith(p)) || contains.some((c) => f.name.toLowerCase().includes(c)) || (list && f.primary),
  );
  const names = fields.map((f) => f.name);
  return {
    ...data,
    fields,
    records: data.records.map((r) => ({ id: r.id, fields: Object.fromEntries(names.map((n) => [n, r.fields[n] ?? null])), ...(r.links ? { links: r.links } : {}) })),
  };
}

// Status codes the UI distinguishes: not located / not connected / failed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const src = sourceByKey(key);
  if (!src) return NextResponse.json({ status: "unknown", error: "未知的資料來源" }, { status: 404 });

  if (req.nextUrl.searchParams.get("demo") === "1") {
    if (!hasDemo(key)) return NextResponse.json({ status: "no-demo" });
    return NextResponse.json({ status: "ok", data: project(demoSourceData(src), req) });
  }
  if (src.restricted === "hr") {
    const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
    const perm = hrPermission(session);
    if (!perm.canView) return NextResponse.json({ status: "forbidden", error: perm.reason, openId: session?.openId }, { status: 403 });
  }
  if (!isLocated(src)) return NextResponse.json({ status: "not-located" });
  if (!isLarkConfigured()) return NextResponse.json({ status: "not-connected" });

  try {
    const data = await getSourceData(src, req.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({ status: "ok", data: project(data, req) });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[source ${key}]`, message);
    const prev = lastGood<TableData>(sourceCacheKey(src));
    if (prev) return NextResponse.json({ status: "ok", data: project({ ...prev, stale: true, error: message }, req) });
    return NextResponse.json({ status: "error", error: message }, { status: 502 });
  }
}
