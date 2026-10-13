import { NextResponse } from "next/server";
import { isLarkConfigured } from "@/lib/lark";
import { storageStatus } from "@/lib/sopStore";
import { APP_VERSION } from "@/lib/version";
import { warmStatus } from "@/lib/warm";

export const dynamic = "force-dynamic";

// Public diagnostics: build version and how long each table took to load from Lark.
// Carries no table contents.
export async function GET() {
  const now = Date.now();
  return NextResponse.json({
    version: APP_VERSION,
    larkConfigured: isLarkConfigured(),
    uptimeSec: Math.round(process.uptime()),
    storage: await storageStatus(),
    sopEditors: (process.env.SOP_EDITORS ?? "").split(/[\s,]+/).filter(Boolean).length,
    warm: {
      running: Boolean(warmStatus.lastStart && (!warmStatus.lastEnd || warmStatus.lastEnd < warmStatus.lastStart)),
      lastRunSecAgo: warmStatus.lastEnd ? Math.round((now - warmStatus.lastEnd) / 1000) : null,
      lastRunMs: warmStatus.lastEnd && warmStatus.lastStart ? warmStatus.lastEnd - warmStatus.lastStart : null,
      ok: warmStatus.ok,
      total: warmStatus.total,
      sources: warmStatus.sources,
    },
  });
}
