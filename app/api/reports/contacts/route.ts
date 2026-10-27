import { NextRequest, NextResponse } from "next/server";
import { getSourceData, isLarkConfigured } from "@/lib/lark";
import { sourceByKey } from "@/lib/reports";
import { demoSourceData } from "@/lib/demo";
import { computeOwnerContacts } from "@/lib/ownerContacts";
import { APP_VERSION } from "@/lib/version";
export const dynamic = "force-dynamic";
export async function GET(req:NextRequest) {
 const p=req.nextUrl.searchParams, keys=["contact-log","v3-contact-log","v3-cases","v3-people"];
 const entries=await Promise.all(keys.map(async key=>{ try { const src=sourceByKey(key)!; if(p.get("demo")==="1") return [key,demoSourceData(src)] as const; if(!isLarkConfigured()) return [key,undefined] as const; return [key,await getSourceData(src,p.get("refresh")==="1")] as const; } catch { return [key,undefined] as const; } }));
 const params=Object.fromEntries(p.entries()); const result=computeOwnerContacts(Object.fromEntries(entries),{...params,seed:p.get("demo")!=="1"});
 return NextResponse.json({status:"ok",...result,meta:{fetched_at:new Date().toISOString(),version:APP_VERSION}});
}
