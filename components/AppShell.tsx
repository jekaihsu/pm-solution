"use client";
import { ChevronLeft, ChevronRight, Database, FlaskConical, LayoutGrid, LogOut, Menu, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { REPORTS, type DataVersion, type SourceDef } from "@/lib/reports";
import { MAX_FORWARD_WEEKS, isoWeek, weekName, weekParamToOffset, weekRange, type WeekRange } from "@/lib/week";

interface Ctx {
  week: WeekRange;
  setWeekOffset: (n: number) => void;
  demo: boolean;
  setDemo: (b: boolean) => void;
  tick: number; // bumps on every refresh (auto or manual)
  manual: boolean; // last bump came from the refresh button → bypass the server cache
  refresh: () => void;
  version: VersionFilter;
}

export type VersionFilter = "all" | DataVersion;
export const showSource = (s: SourceDef, v: VersionFilter) => v === "all" || !s.version || s.version === v;

const ShellContext = createContext<Ctx | null>(null);
export const useShell = () => useContext(ShellContext)!;

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function crumb(pathname: string): string {
  if (pathname === "/") return "總覽";
  if (pathname === "/sources") return "資料來源";
  const r = REPORTS.find((x) => pathname === `/reports/${x.slug}`);
  return r ? `${r.id} ${r.name}` : "";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [offset, setWeekOffset] = useState(0); // default to the current week (shareable via ?week=)
  const [urlReady, setUrlReady] = useState(false);
  const [demo, setDemo] = useState(false);
  const [version, setVersion] = useState<VersionFilter>("all");
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; avatar?: string } | null>(null);
  const pathname = usePathname();

  useEffect(() => setNavOpen(false), [pathname]);
  // Restore the week from ?week=YYYY-Www on first load (shareable links), then keep the
  // URL in sync as the picker changes. Uses history.replaceState so report pages stay SSG.
  useEffect(() => {
    const parsed = weekParamToOffset(new URLSearchParams(window.location.search).get("week"));
    if (parsed !== null) setWeekOffset(Math.min(MAX_FORWARD_WEEKS, parsed));
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const u = new URL(window.location.href);
    u.searchParams.set("week", isoWeek(weekRange(offset).start));
    window.history.replaceState(null, "", u);
  }, [offset, urlReady]);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setUser(j.user))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      setManual(false);
      setTick((n) => n + 1);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const week = weekRange(offset);
  const ctx: Ctx = { week, setWeekOffset, demo, setDemo, tick, refresh: () => {
      setManual(true);
      setTick((n) => n + 1);
    },
    manual,
    version,
  };

  return (
    <ShellContext.Provider value={ctx}>
      <div className={`shell ${demo ? "is-demo" : ""}`}>
        <aside className={`sidebar ${navOpen ? "open" : ""}`}>
          <Link href="/" className="ws">
            <span className="ws-logo">PM</span>
            <span className="ws-text">
              <span className="ws-name">PM 週報</span>
              <span className="ws-sub">Lark Base · 唯讀</span>
            </span>
          </Link>

          <nav className="nav">
            <Link href="/" className={`nav-item ${pathname === "/" ? "active" : ""}`}>
              <LayoutGrid size={16} strokeWidth={1.75} />
              總覽
            </Link>
            <div className="nav-label">報告</div>
            {REPORTS.map((r) => (
              <Link key={r.id} href={`/reports/${r.slug}`} className={`nav-item ${pathname === `/reports/${r.slug}` ? "active" : ""}`}>
                <span className="nav-rid">{r.id.slice(1)}</span>
                <span className="nav-text">{r.name}</span>
              </Link>
            ))}
            <div className="nav-label">設定</div>
            <Link href="/sources" className={`nav-item ${pathname === "/sources" ? "active" : ""}`}>
              <Database size={16} strokeWidth={1.75} />
              資料來源
            </Link>
          </nav>

          <div className="sidebar-foot">
            <label className="switch">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              <span className="switch-ui" aria-hidden />
              <FlaskConical size={14} strokeWidth={1.75} />
              示範資料
            </label>
            {user && (
              <div className="me">
                {user.avatar ? <img src={user.avatar} alt="" className="avatar" /> : <span className="avatar">{user.name.slice(0, 1)}</span>}
                <span className="me-name">{user.name}</span>
                <a href="/api/auth/logout" className="icon-btn" title="登出" aria-label="登出">
                  <LogOut size={15} strokeWidth={1.75} />
                </a>
              </div>
            )}
          </div>
        </aside>
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

        <div className="main">
          <header className="topbar">
            <button className="icon-btn nav-toggle" onClick={() => setNavOpen((o) => !o)} aria-label="選單">
              <Menu size={18} strokeWidth={1.75} />
            </button>
            <div className="crumbs">
              <span className="crumb-root">PM 週報</span>
              <ChevronRight size={14} className="crumb-sep" />
              <span className="crumb-here">{crumb(pathname)}</span>
              {demo && <span className="pill pill-warn">示範資料</span>}
            </div>
            <div className="topbar-right">
              <div className="week-picker" role="group" aria-label="統計週">
                <button className="icon-btn" onClick={() => setWeekOffset(offset - 1)} aria-label="前一週">
                  <ChevronLeft size={16} />
                </button>
                <button className="week-label" onClick={() => setWeekOffset(0)} title="回到本週">
                  <span className="week-name">{weekName(offset)}</span>
                  <span className="week-range">{week.label}</span>
                </button>
                <button className="icon-btn" onClick={() => setWeekOffset(offset + 1)} disabled={offset >= MAX_FORWARD_WEEKS} aria-label="下一週">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="seg" role="group" aria-label="資料版本">
                {(["all", "v3", "v4"] as const).map((v) => (
                  <button key={v} className={version === v ? "on" : ""} onClick={() => setVersion(v)} aria-pressed={version === v}>
                    {v === "all" ? "全部" : v.toUpperCase()}
                  </button>
                ))}
              </div>
              <button className="icon-btn bordered" onClick={ctx.refresh} aria-label="重新整理" title="重新整理">
                <RefreshCw size={15} strokeWidth={1.75} />
              </button>
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}
