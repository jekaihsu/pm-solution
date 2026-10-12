import { NextResponse, type NextRequest } from "next/server";
import { getTableData, isLarkConfigured } from "@/lib/lark";
import { demoTableData } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  if (!isLarkConfigured()) return NextResponse.json(demoTableData());

  const force = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    return NextResponse.json(await getTableData(tableId, force));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
