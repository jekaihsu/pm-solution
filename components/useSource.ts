"use client";
import { useEffect, useState } from "react";
import type { TableData } from "@/lib/types";
import { useShell } from "./AppShell";

export type SourceStatus = "loading" | "ok" | "not-located" | "not-connected" | "no-demo" | "error";

export interface SourceState {
  status: SourceStatus;
  data?: TableData;
  error?: string;
}

export function useSource(key: string): SourceState {
  const { demo, tick } = useShell();
  const [state, setState] = useState<SourceState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (demo) qs.set("demo", "1");
    if (tick > 0) qs.set("refresh", "1");
    fetch(`/api/sources/${key}?${qs}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setState({ status: j.status, data: j.data, error: j.error }))
      .catch((e) => !cancelled && setState((prev) => ({ ...prev, status: prev.data ? "ok" : "error", error: String(e) })));
    return () => {
      cancelled = true;
    };
  }, [key, demo, tick]);

  return state;
}

export const STATUS_TEXT: Record<SourceStatus, string> = {
  loading: "載入中…",
  ok: "已讀取",
  "not-located": "來源尚未定位",
  "not-connected": "尚未連接 Lark（伺服器未設定應用憑證）",
  "no-demo": "此來源沒有示範資料",
  error: "讀取失敗",
};
