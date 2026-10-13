"use client";
import { useEffect, useState } from "react";
import type { TableData } from "@/lib/types";
import { useShell } from "./AppShell";

export type SourceStatus = "loading" | "ok" | "not-located" | "not-connected" | "no-demo" | "forbidden" | "error";

export interface SourceState {
  status: SourceStatus;
  data?: TableData;
  error?: string;
  openId?: string; // set with "forbidden" so the viewer can ask for access
}

export interface SourceOptions {
  only?: "dates" | "meta"; // just the date fields (overview trends) / just the field list
  fields?: string[]; // just these field names, if present (dashboards)
  links?: boolean; // also return link fields' record_ids (record.links)
  enabled?: boolean; // false → don't fetch (e.g. a collapsed section)
}

export function useSource(key: string, opts: SourceOptions = {}): SourceState {
  const { demo, tick, manual } = useShell();
  const base = opts.only ? `only=${opts.only}` : opts.fields ? new URLSearchParams({ fields: opts.fields.join(",") }).toString() : "";
  const projection = opts.links ? `${base}${base ? "&" : ""}links=1` : base;
  const enabled = opts.enabled !== false;
  // Tag each result with the source + mode + projection it belongs to, so a switch never
  // shows the previous table's data while the new one loads.
  const tag = `${key}|${demo ? "demo" : "live"}|${projection}`;
  const [state, setState] = useState<SourceState & { tag?: string }>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const qs = new URLSearchParams(projection);
    if (demo) qs.set("demo", "1");
    if (tick > 0 && manual) qs.set("refresh", "1");
    fetch(`/api/sources/${key}?${qs}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setState({ status: j.status, data: j.data, error: j.error, openId: j.openId, tag }))
      .catch((e) => !cancelled && setState((prev) => (prev.tag === tag ? { ...prev, status: prev.data ? "ok" : "error", error: String(e) } : { status: "error", error: String(e), tag })));
    return () => {
      cancelled = true;
    };
  }, [key, demo, tick, tag, manual, enabled, projection]);

  return state.tag === tag ? state : { status: "loading" };
}

export const STATUS_TEXT: Record<SourceStatus, string> = {
  loading: "載入中…",
  ok: "已讀取",
  "not-located": "來源尚未定位",
  "not-connected": "尚未連接 Lark（伺服器未設定應用憑證）",
  "no-demo": "此來源沒有示範資料",
  forbidden: "沒有查看權限",
  error: "讀取失敗",
};
