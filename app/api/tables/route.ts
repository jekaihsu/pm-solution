import { NextResponse } from "next/server";
import { isLarkConfigured, listTables } from "@/lib/lark";
import { DEMO_TABLES } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isLarkConfigured()) {
    return NextResponse.json({ source: "demo", tables: DEMO_TABLES, defaultTableId: DEMO_TABLES[0].id });
  }
  try {
    const tables = await listTables();
    const preferred = process.env.LARK_DEFAULT_TABLE_ID;
    const defaultTableId = tables.some((t) => t.id === preferred) ? preferred : tables[0]?.id;
    return NextResponse.json({ source: "lark", tables, defaultTableId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
