import { NextResponse, type NextRequest } from "next/server";
import { getSourceData, isLarkConfigured, lastGood, sourceCacheKey } from "@/lib/lark";
import { demoSourceData, hasDemo } from "@/lib/demo";
import { isLocated, sourceByKey } from "@/lib/reports";
import type { TableData } from "@/lib/types";

export const dynamic = "force-dynamic";

// Trims a table to what a page needs. The full table stays in the server cache;
// only the response gets smaller.
//  only=meta   → field list and counts, no records (sources page)
//  only=dates  → date fields only (overview trend counts)
//  fields=a,b  → those names; "x*" matches a prefix, "@dates" every date field
function project(data: TableData, req: NextRequest): TableData {
  const only = req.nextUrl.searchParams.get("only");
  const list = req.nextUrl.searchParams.get("fields");
  if (only === "meta") return { ...data, records: [] };
  if (!only && !list) return data;
  const tokens = list ? list.split(",") : [];
  const exact = new Set(tokens.filter((t) => !t.endsWith("*") && !t.startsWith("@")));
  const prefixes = tokens.filter((t) => t.endsWith("*")).map((t) => t.slice(0, -1));
  const allDates = only === "dates" || tokens.includes("@dates");
  const fields = data.fields.filter(
    (f) => (allDates && f.kind === "date") || exact.has(f.name) || prefixes.some((p) => f.name.startsWith(p)) || (list && f.primary),
  );
  const names = fields.map((f) => f.name);
  return {
    ...data,
    fields,
    records: data.records.map((r) => ({ id: r.id, fields: Object.fromEntries(names.map((n) => [n, r.fields[n] ?? null])) })),
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
