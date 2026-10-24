"use client";
import { CalendarRange, ChevronLeft, ChevronRight, Database, FlaskConical, LayoutGrid, LogOut, Menu, RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { REPORTS, type DataVersion, type SourceDef } from "@/lib/reports";
import { MAX_FORWARD_WEEKS, customRange, isoWeek, msToDateStr, weekName, weekParamToOffset, weekRange, type WeekRange } from "@/lib/week";

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

// Custom date-range picker (item 7): two date inputs in a popover; Apply sets a
// custom range on the shell, Clear returns to this week. Closes on outside click.
function RangePicker({ week, active, onApply, onClear }: { week: WeekRange; active: boolean; onApply: (from: string, to: string) => void; onClear: () => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [from, setFrom] = useState(() => msToDateStr(week.start));
  const [to, setTo] = useState(() => msToDateStr(week.end - 86400000));
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  // Keep the inputs showing the active window when it changes from outside.
  useEffect(() => {
    setFrom(msToDateStr(week.start));
    setTo(msToDateStr(week.end - 86400000));
  }, [week.start, week.end]);
  return (
    <details ref={ref} className={`pop ${active ? "on" : ""}`}>
      <summary className="icon-btn bordered" title="自訂日期範圍" aria-label="自訂日期範圍">
        <CalendarRange size={15} strokeWidth={1.75} />
      </summary>
      <div className="pop-body range-pop">
        <div className="pop-title">自訂日期範圍</div>
        <label className="range-field">
          起 <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="range-field">
          訖 <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <div className="range-actions">
          {active && (
            <button
              className="btn ghost small"
              onClick={() => {
                onClear();
                if (ref.current) ref.current.open = false;
              }}
            >
              回到本週
            </button>
          )}
          <button
            className="btn small"
            disabled={!from || !to || to < from}
            onClick={() => {
              onApply(from, to);
              if (ref.current) ref.current.open = false;
            }}
          >
            套用
          </button>
        </div>
        <p className="muted small">依各報表的日期欄位篩選所選範圍（含起訖當天，台北）。出勤等以單週為單位的頁面會取範圍起日所在的那一週。</p>
      </div>
    </details>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [offset, setOffsetState] = useState(0); // default to the current week (shareable via ?week=)
  const [range, setRange] = useState<{ from: string; to: string } | null>(null); // custom date range (item 7)
  const [urlReady, setUrlReady] = useState(false);
  const [demo, setDemo] = useState(false);
  // Choosing a week clears any custom range; choosing a range is handled separately.
  const setWeekOffset = (n: number) => {
    setRange(null);
    setOffsetState(n);
  };
  const [version, setVersion] = useState<VersionFilter>("all");
  const [tick, setTick] = useState(0);
  const [manual, setManual] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; avatar?: string } | null>(null);
  const pathname = usePathname();

  useEffect(() => setNavOpen(false), [pathname]);
  // Read the current URL's query string into the week/range selection. Used on first
  // load (shareable links) and on browser back/forward (popstate) so the selection
  // always matches the address bar.
  const applyFromUrl = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);
    const from = sp.get("from");
    const to = sp.get("to");
    if (from && to && customRange(from, to)) {
      setRange({ from, to });
      return;
    }
    const parsed = weekParamToOffset(sp.get("week"));
    setRange(null);
    setOffsetState(parsed !== null ? Math.min(MAX_FORWARD_WEEKS, parsed) : 0);
  }, []);
  useEffect(() => {
    applyFromUrl();
    setUrlReady(true);
    // Restore the selection when the user navigates browser history (back/forward).
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, [applyFromUrl]);
  // Keep the URL in sync as the picker changes, and re-apply the query after a sidebar
  // navigation (Next's <Link> drops it) so ?week=/?from/?to survive page changes.
  // Uses history.replaceState so report pages stay SSG.
  useEffect(() => {
    if (!urlReady) return;
    const u = new URL(window.location.href);
    if (range) {
      u.searchParams.set("from", range.from);
      u.searchParams.set("to", range.to);
      u.searchParams.delete("week");
    } else {
      u.searchParams.set("week", isoWeek(weekRange(offset).start));
      u.searchParams.delete("from");
      u.searchParams.delete("to");
    }
    window.history.replaceState(null, "", u);
  }, [offset, range, urlReady, pathname]);
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

  const week = (range && customRange(range.from, range.to)) || weekRange(offset);
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
                <button className="icon-btn" onClick={() => setWeekOffset(offset - 1)} aria-label="前一週" disabled={!!range} title={range ? "自訂範圍中，請先回到週" : "前一週"}>
                  <ChevronLeft size={16} />
                </button>
                <button className="week-label" onClick={() => setWeekOffset(0)} title="回到本週">
                  <span className="week-name">{range ? "自訂" : weekName(offset)}</span>
                  <span className="week-range">{week.label}</span>
                </button>
                <button className="icon-btn" onClick={() => setWeekOffset(offset + 1)} disabled={!!range || offset >= MAX_FORWARD_WEEKS} aria-label="下一週" title={range ? "自訂範圍中，請先回到週" : "下一週"}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <RangePicker week={week} active={!!range} onApply={(from, to) => setRange({ from, to })} onClear={() => setWeekOffset(0)} />
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
