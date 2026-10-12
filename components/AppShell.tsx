"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { REPORTS } from "@/lib/reports";
import { weekName, weekRange, type WeekRange } from "@/lib/week";

interface Ctx {
  week: WeekRange;
  setWeekOffset: (n: number) => void;
  demo: boolean;
  setDemo: (b: boolean) => void;
  tick: number; // bumps on manual refresh
  refresh: () => void;
}

const ShellContext = createContext<Ctx | null>(null);
export const useShell = () => useContext(ShellContext)!;

const AUTO_REFRESH_MS = 5 * 60 * 1000;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [offset, setWeekOffset] = useState(-1); // reports default to last week
  const [demo, setDemo] = useState(false);
  const [tick, setTick] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const week = weekRange(offset);
  const ctx: Ctx = { week, setWeekOffset, demo, setDemo, tick, refresh: () => setTick((n) => n + 1) };

  return (
    <ShellContext.Provider value={ctx}>
      <div className={`shell ${demo ? "is-demo" : ""}`}>
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <Link href="/" className="logo">
            PM 週報
          </Link>
          <nav>
            <Link href="/" className={pathname === "/" ? "active" : ""}>
              總覽
            </Link>
            <div className="nav-label">報告</div>
            {REPORTS.map((r) => (
              <Link key={r.id} href={`/reports/${r.slug}`} className={pathname === `/reports/${r.slug}` ? "active" : ""}>
                <span className="rid">{r.id}</span> {r.name}
              </Link>
            ))}
            <div className="nav-label">參考</div>
            <Link href="/sources" className={pathname === "/sources" ? "active" : ""}>
              資料來源與定義
            </Link>
          </nav>
        </aside>
        <div className="main">
          <header className="topbar">
            <button className="btn ghost nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="選單">
              ☰
            </button>
            <div className="week-picker" role="group" aria-label="統計週">
              <button className="btn small" onClick={() => setWeekOffset(offset - 1)} aria-label="前一週">
                ‹
              </button>
              <span className="week-label">
                <strong>{weekName(offset)}</strong> {week.label}
              </span>
              <button className="btn small" onClick={() => setWeekOffset(offset + 1)} disabled={offset >= 0} aria-label="下一週">
                ›
              </button>
            </div>
            <div className="topbar-right">
              <label className="toggle">
                <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
                示範資料
              </label>
              <button className="btn small" onClick={ctx.refresh}>
                重新整理
              </button>
            </div>
          </header>
          {demo && <div className="demo-banner">目前顯示的是虛構示範資料，不是真實數字，請勿引用。</div>}
          <main className="content">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
