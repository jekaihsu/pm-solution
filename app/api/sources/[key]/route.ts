import { NextResponse, type NextRequest } from "next/server";
import { getSourceData, isLarkConfigured, lastGood, sourceCacheKey } from "@/lib/lark";
import { demoSourceData, hasDemo } from "@/lib/demo";
import { isLocated, sourceByKey } from "@/lib/reports";
import type { TableData } from "@/lib/types";

export const dynamic = "force-dynamic";

// Status codes the UI distinguishes: not located / not connected / failed.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const src = sourceByKey(key);
  if (!src) return NextResponse.json({ status: "unknown", error: "未知的資料來源" }, { status: 404 });

  if (req.nextUrl.searchParams.get("demo") === "1") {
    if (!hasDemo(key)) return NextResponse.json({ status: "no-demo" });
    return NextResponse.json({ status: "ok", data: demoSourceData(src) });
  }
  if (!isLocated(src)) return NextResponse.json({ status: "not-located" });
  if (!isLarkConfigured()) return NextResponse.json({ status: "not-connected" });

  try {
    const data = await getSourceData(src, req.nextUrl.searchParams.get("refresh") === "1");
    return NextResponse.json({ status: "ok", data });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[source ${key}]`, message);
    const prev = lastGood<TableData>(sourceCacheKey(src));
    if (prev) return NextResponse.json({ status: "ok", data: { ...prev, stale: true, error: message } });
    return NextResponse.json({ status: "error", error: message }, { status: 502 });
  }
}
