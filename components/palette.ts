"use client";
import { useEffect, useState } from "react";

// Categorical slots in fixed order (validated light/dark steps). Never cycled:
// anything past slot 8 is folded into "其他" by the chart layer.
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

export const OTHER = "其他";
export const MAX_SERIES = 8;

export interface ChartTheme {
  series: string[];
  other: string;
  surface: string;
  grid: string;
  axis: string;
  muted: string;
  text: string;
}

const lightTheme: ChartTheme = {
  series: LIGHT,
  other: "#a1a1aa",
  surface: "#ffffff",
  grid: "#f0f0f2",
  axis: "#e4e4e7",
  muted: "#a1a1aa",
  text: "#09090b",
};
const darkTheme: ChartTheme = {
  series: DARK,
  other: "#71717a",
  surface: "#111113",
  grid: "#1f1f23",
  axis: "#27272a",
  muted: "#71717a",
  text: "#fafafa",
};

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return dark ? darkTheme : lightTheme;
}

// Stable color per category: assigned by first appearance in the *unfiltered*
// key list the caller provides, so filtering never repaints survivors.
export function colorFor(key: string, keys: string[], theme: ChartTheme): string {
  if (key === OTHER) return theme.other;
  const i = keys.indexOf(key);
  return i >= 0 && i < MAX_SERIES ? theme.series[i] : theme.other;
}
