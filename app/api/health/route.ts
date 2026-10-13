import { NextResponse } from "next/server";
import { findFields, isLarkConfigured } from "@/lib/lark";
import { storageStatus } from "@/lib/sopStore";
import { APP_VERSION } from "@/lib/version";
import { warmStatus } from "@/lib/warm";

export const dynamic = "force-dynamic";

// Public diagnostics: build version and how long each table took to load from Lark.
// Carries no table contents.
const BASES = { v3: "Sdw1bG1djaHsVGsRPvmjyVWipgg", v4: "H7W6b0PFWaVF1BsgqXJj3pQ9pXb" };

async function sopFields() {
  const out: Record<string, unknown> = {};
  for (const [k, token] of Object.entries(BASES)) {
    try {
      out[k] = await Promise.race([findFields(token, /sop/i), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
    } catch (err) {
      out[k] = { error: (err as Error).message.slice(0, 160) };
    }
  }
  return out;
}

export async function GET() {
  const now = Date.now();
  return NextResponse.json({
    version: APP_VERSION,
    larkConfigured: isLarkConfigured(),
    uptimeSec: Math.round(process.uptime()),
    storage: await storageStatus(),
    // Where the 日報「是否違反SOP」field lives (table/field names only, no data).
    sopFields: isLarkConfigured() ? await sopFields() : null,
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
