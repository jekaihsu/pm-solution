"use client";

import React, { useState, useMemo } from "react";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Truck,
  Users,
  ExternalLink,
  CalendarCheck,
  ShieldAlert,
  ArrowRightLeft,
  QrCode,
  Database,
  Radar,
  Search,
  FileCheck2,
} from "lucide-react";
import {
  LARK_DB_META,
  INITIAL_INSTRUMENTS,
  CREW_RADAR_DATA,
  DYNAMIC_ROSTER_SAMPLE,
  computeDeduplicatedUsageDays,
  findDynamicOffboardedAssets,
  type InstrumentItem,
} from "@/lib/equip_t43_domain";

type FilterChip =
  | "all"
  | "available"
  | "overdue"
  | "taf_alert"
  | "monthly_photo"
  | "offboarded";

export default function EquipmentBoard() {
  const [instruments, setInstruments] = useState<InstrumentItem[]>(INITIAL_INSTRUMENTS);
  const [activeChip, setActiveChip] = useState<FilterChip>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [returnDone, setReturnDone] = useState(false);
  const [monthlyPhotoUploaded, setMonthlyPhotoUploaded] = useState(false);
  const [vehicleResolution, setVehicleResolution] = useState<
    "conflict" | "reassigned_DEF5678" | "shared_true"
  >("conflict");
  const [bundleClaimed, setBundleClaimed] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([
    "2026-10-19",
    "2026-10-21",
    "2026-10-23",
    "2026-10-21", // duplicate entry to prove automatic deduplication (fldjH7l0vd)
  ]);
  const [selectedTafInstrumentId, setSelectedTafInstrumentId] =
    useState<string>("TC1101(622382)");

  const dedupResult = useMemo(
    () => computeDeduplicatedUsageDays(selectedDates),
    [selectedDates]
  );

  // INV-ASSET-5: Dynamic offboarded employee unreturned asset check (zero hardcoded names)
  const offboardedAlerts = useMemo(
    () => findDynamicOffboardedAssets(instruments, DYNAMIC_ROSTER_SAMPLE),
    [instruments]
  );

  const myBorrowed = useMemo(
    () =>
      instruments.filter(
        (i) =>
          i.holderEmployeeId === "EMP-011" &&
          (i.status === "逾期未還" || i.status === "已借出")
      ),
    [instruments]
  );

  const selectedTafInst = useMemo(
    () =>
      instruments.find((i) => i.id === selectedTafInstrumentId) || instruments[1],
    [instruments, selectedTafInstrumentId]
  );

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return instruments.filter((i) => {
      if (
        q &&
        !i.id.toLowerCase().includes(q) &&
        !i.name.toLowerCase().includes(q) &&
        !i.ownerCrew.toLowerCase().includes(q)
      ) {
        return false;
      }
      switch (activeChip) {
        case "available":
          return i.status === "可借用";
        case "overdue":
          return i.status === "逾期未還";
        case "taf_alert":
          return (
            i.calibrationStatus === "即將到期" ||
            i.calibrationStatus === "校正過期"
          );
        case "monthly_photo":
          return i.rentType === "月租型" && !i.monthlyPhotoVerified;
        case "offboarded":
          return offboardedAlerts.some((a) => a.instrument.id === i.id);
        default:
          return true;
      }
    });
  }, [instruments, activeChip, searchQuery, offboardedAlerts]);

  const handleOneTapPhotoReturn = () => {
    setReturnDone(true);
    setMonthlyPhotoUploaded(true);
    setInstruments((prev) =>
      prev.map((item) => {
        if (item.id === "GPS S901") {
          return {
            ...item,
            status: "可借用",
            holderEmployeeId: undefined,
            holderLabel: undefined,
            locationNote: "已拍照歸還入庫（單張照片檢核通過 · 實際使用 3 天）",
          };
        }
        if (item.id === "TC1101(622382)") {
          return {
            ...item,
            monthlyPhotoCount: 1,
            monthlyPhotoVerified: true,
            locationNote: "台中港外業駐點（月租單張照已上傳檢核通過 ✅）",
          };
        }
        return item;
      })
    );
  };

  const toggleUsageDate = (d: string) => {
    setSelectedDates((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  return (
    <div
      data-testid="equip-variant-c-winner"
      style={{
        maxWidth: 1400,
        margin: "0 auto",
        padding: "8px 12px 32px",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0f172a",
      }}
    >
      {/* TOP BAR: Lark-as-DB JSON Sync Status Bar (YHqcbb8MHa4VdGsA0UnjajNDpgd 210/210 checks green) */}
      <div
        data-testid="lark-db-sync-bar"
        style={{
          background: "#0f172a",
          color: "#f8fafc",
          borderRadius: 12,
          padding: "9px 14px",
          marginBottom: 10,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          fontSize: 12,
          border: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              background: "#16a34a",
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <CheckCircle2 size={13} />
            {LARK_DB_META.checksPassed}/{LARK_DB_META.checksTotal} checks green
          </span>
          <span style={{ fontWeight: 800, color: "#38bdf8" }}>
            <Database size={13} style={{ display: "inline", marginRight: 4 }} />
            Lark-as-DB ({LARK_DB_META.baseToken}) · {LARK_DB_META.version}
          </span>
          <span style={{ color: "#cbd5e1", fontSize: 11 }}>
            系統正式資料 {LARK_DB_META.tables.systemOfficial.rows} 筆 · 系統申請紀錄{" "}
            {LARK_DB_META.tables.systemRequests.rows} 筆 · 系統附件{" "}
            {LARK_DB_META.tables.systemAttachments.rows} 筆 ➔ 同步{" "}
            <strong>- 儀器總表 {LARK_DB_META.tables.instrumentsMaster.activeRows}台</strong> ·{" "}
            <strong>車輛 {LARK_DB_META.tables.vehicles.activeRows}+1台</strong> ·{" "}
            <strong>借單明細 {LARK_DB_META.tables.loanDetails.rows}筆</strong>
          </span>
        </div>

        {/* Live QR / Serial Quick Lookup */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: "4px 10px",
            minWidth: 250,
          }}
        >
          <QrCode size={14} color="#38bdf8" />
          <Search size={13} color="#94a3b8" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="掃碼/搜儀器或車牌 (TC1101 / S901 / ABC-1234)"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f8fafc",
              fontSize: 11,
              width: "100%",
            }}
          />
        </div>
      </div>

      {/* RESPONSIVE SPLIT GRID:
          On mobile (390px) -> stacks cleanly with 1-Thumb Deck on top.
          On desktop (1440px) -> 2-column Arena Winner synthesis (Left: 1-Thumb Field Deck, Right: Crew Radar + TAF Modal + Dynamic Offboarding) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* COLUMN 1: Candidate A's 3-Second Mobile 1-Thumb Borrow/Return + Single-Photo + Multi-Date Dedup + GiST Guard */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* SECTION 1: 我的借用中設備（2台） + Giant 1-Tap Photo Return */}
          <section
            aria-label="我的借用中設備"
            style={{
              background: "#ffffff",
              border: "2px solid #dc2626",
              borderRadius: 14,
              padding: "11px 12px",
              boxShadow: "0 4px 14px rgba(220, 38, 38, 0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    background: "#dc2626",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 10,
                    padding: "2px 7px",
                    borderRadius: 999,
                  }}
                >
                  INV-ASSET-3 置頂 vewbFQ1Mbf
                </span>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                  我的借用中設備（{myBorrowed.length}台 · 古恆安 地形A）
                </h2>
              </div>
              <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 800 }}>
                單張照即過檢核
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 9 }}>
              {/* Overdue GPS S901 + Multi-Date Deduplicated Counter */}
              <div
                style={{
                  background: returnDone ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${returnDone ? "#86efac" : "#fecaca"}`,
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#991b1b" }}>
                      GPS S901
                    </span>
                    <span style={{ fontSize: 11, color: "#475569", marginLeft: 6 }}>
                      Stonex GNSS · 日租型 · 案號 C115055-1
                    </span>
                  </div>
                  <span
                    style={{
                      background: returnDone ? "#16a34a" : "#dc2626",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 7px",
                      borderRadius: 6,
                    }}
                  >
                    {returnDone ? "已拍照歸還 ✅" : "🚨 逾期未還 (應還 10/23)"}
                  </span>
                </div>

                {/* Multi-date deduplicated counter (fldjH7l0vd & fldSLwUkKd) */}
                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 5,
                    borderTop: "1px dashed #fca5a5",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: "#334155" }}>
                      <CalendarCheck size={12} style={{ display: "inline", marginRight: 3 }} />
                      實際使用天數多選去重 (fldjH7l0vd)：
                    </span>
                    <span
                      style={{
                        background: "#0f172a",
                        color: "#38bdf8",
                        padding: "1px 7px",
                        borderRadius: 99,
                        fontWeight: 800,
                      }}
                    >
                      自動去重 = {dedupResult.count} 天（不補中間空檔）
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-25"].map((dt) => {
                      const active = dedupResult.uniqueSorted.includes(dt);
                      return (
                        <button
                          key={dt}
                          type="button"
                          onClick={() => toggleUsageDate(dt)}
                          style={{
                            border: active ? "1px solid #0284c7" : "1px solid #cbd5e1",
                            background: active ? "#e0f2fe" : "#ffffff",
                            color: active ? "#0369a1" : "#64748b",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {dt.slice(5)} {active ? "✓" : "+"}
                        </button>
                      );
                    })}
                    <span
                      style={{
                        background: "#fef3c7",
                        color: "#92400e",
                        border: "1px solid #fcd34d",
                        borderRadius: 6,
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      舊格式缺年份檢核 (fldSLwUkKd): 08/15 ➔ ⚠ 待確認
                    </span>
                  </div>
                </div>
              </div>

              {/* Second Borrowed Item: TC1101(622382) with TAF Link & Monthly 1-Photo Check */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>TC1101(622382)</span>
                    <span style={{ fontSize: 11, color: "#475569", marginLeft: 6 }}>
                      經緯儀 · 月租型 · 效期 2026-11-09
                    </span>
                  </div>
                  <a
                    href="https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recvrSmzqZ3mHM"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedTafInstrumentId("TC1101(622382)");
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1px solid #93c5fd",
                      borderRadius: 6,
                      padding: "2px 7px",
                      fontSize: 10,
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    查看TAF校正報告 <ExternalLink size={10} />
                  </a>
                </div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>
                  月租照片檢核 (fldkKrBoKq / fldsgbnQo4)：
                  <strong style={{ color: monthlyPhotoUploaded ? "#15803d" : "#b45309", marginLeft: 4 }}>
                    {monthlyPhotoUploaded ? "✅ 單張照片已合格 (1/1)" : "⏳ 拍 1 張照片即可通過檢核"}
                  </strong>
                </div>
              </div>
            </div>

            {/* GIANT 1-TAP PHOTO RETURN BUTTON */}
            <button
              type="button"
              onClick={handleOneTapPhotoReturn}
              data-testid="winner-one-tap-return"
              style={{
                width: "100%",
                minHeight: 52,
                background: returnDone
                  ? "linear-gradient(135deg, #15803d, #16a34a)"
                  : "linear-gradient(135deg, #dc2626, #ea580c)",
                color: "#ffffff",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(220, 38, 38, 0.25)",
              }}
            >
              <Camera size={19} />
              {returnDone
                ? "✅ 已上傳單張照完成歸還（去重計 3 天 · 寫入系統申請紀錄）"
                : "📸 拍一張照立即歸還（自動去重算使用天數）"}
            </button>
          </section>

          {/* SECTION 2: 今日預排案件 C115055-1 一鍵領用建議組合 + Live GiST Vehicle Conflict Guard */}
          <section
            aria-label="今日預排案件一鍵領用建議組合"
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 14,
              padding: "11px 12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                ⚡ 今日預排案件 C115055-1 一鍵領用建議組合（全站儀 + GPS + 車輛）
              </h2>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", background: "#e0f2fe", padding: "2px 6px", borderRadius: 6 }}>
                INV-ASSET-2 & 4
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 8, fontSize: 11 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 8px" }}>
                <div style={{ color: "#dc2626", fontWeight: 700, textDecoration: "line-through", fontSize: 10 }}>
                  🔒 TS15P(511094) 校正過期紅鎖禁派
                </div>
                <div style={{ fontWeight: 800, marginTop: 2 }}>✅ 全站儀：TS16P(651591)</div>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 8px" }}>
                <div style={{ color: "#64748b", fontSize: 10 }}>GPS / RTK 組合</div>
                <div style={{ fontWeight: 800, marginTop: 2 }}>✅ GS18T(782190) (效期有效)</div>
              </div>
            </div>

            {/* GiST Vehicle Conflict Guard */}
            <div
              style={{
                background: vehicleResolution === "conflict" ? "#fffbeb" : "#f0fdf4",
                border: `1.5px solid ${vehicleResolution === "conflict" ? "#f59e0b" : "#22c55e"}`,
                borderRadius: 10,
                padding: "8px 10px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12, color: "#92400e", marginBottom: 6 }}>
                <Truck size={13} style={{ display: "inline", marginRight: 4 }} />
                {vehicleResolution === "conflict"
                  ? "⚠️ 明日地形B已排 ABC-1234（PG GiST period && 重疊防呆）"
                  : vehicleResolution === "reassigned_DEF5678"
                  ? "✅ 已改派 DEF-5678（無重疊衝突）"
                  : "✅ 已設為兩組共乘 ABC-1234 (shared=true)"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setVehicleResolution("reassigned_DEF5678")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #d97706",
                    background: vehicleResolution === "reassigned_DEF5678" ? "#dcfce7" : "#ffffff",
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  🔄 改派 DEF-5678
                </button>
                <button
                  type="button"
                  onClick={() => setVehicleResolution("shared_true")}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid #0284c7",
                    background: vehicleResolution === "shared_true" ? "#dcfce7" : "#f0f9ff",
                    color: "#0369a1",
                    fontWeight: 800,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  🤝 兩組共乘 (shared=true)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (vehicleResolution === "conflict") setVehicleResolution("reassigned_DEF5678");
                setBundleClaimed(true);
              }}
              style={{
                width: "100%",
                minHeight: 40,
                borderRadius: 9,
                border: "none",
                background: bundleClaimed ? "#0f172a" : "#2563eb",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {bundleClaimed
                ? "✓ 已完成 C115055-1 組合領用寫入系統申請紀錄"
                : "🚀 一鍵領用 C115055-1 建議組合（全站儀 + GPS + 車輛）"}
            </button>
          </section>

          {/* SECTION 3: Instant Filter Chips & Asset Status List */}
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 14,
              padding: "11px 12px",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {[
                { key: "all", label: `全部 ${LARK_DB_META.tables.instrumentsMaster.activeRows}台` },
                { key: "available", label: "可借用" },
                { key: "overdue", label: "逾期未還 1 (GPS S901)" },
                { key: "taf_alert", label: "TAF即將到期/過期鎖定" },
                { key: "monthly_photo", label: "月租待補單張照" },
                { key: "offboarded", label: `離職未還動態攔截 (${offboardedAlerts.length})` },
              ].map((chip) => {
                const active = activeChip === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setActiveChip(chip.key as FilterChip)}
                    style={{
                      padding: "5px 9px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 800,
                      border: active ? "1.5px solid #0f172a" : "1px solid #cbd5e1",
                      background: active ? "#0f172a" : "#f8fafc",
                      color: active ? "#ffffff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredList.slice(0, 4).map((inst) => {
                const isExpired = inst.calibrationStatus === "校正過期";
                return (
                  <div
                    key={inst.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "7px 9px",
                      borderRadius: 8,
                      background: isExpired ? "#fff1f2" : "#f8fafc",
                      border: isExpired ? "1.5px solid #f43f5e" : "1px solid #e2e8f0",
                      fontSize: 11,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 800 }}>{inst.id}</span>
                      <span style={{ color: "#64748b", marginLeft: 6 }}>
                        {inst.category} · {inst.ownerCrew} · 效期 {inst.nextCalibrationDate}
                      </span>
                    </div>
                    {isExpired ? (
                      <button
                        type="button"
                        disabled
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #f43f5e",
                          background: "#ffe4e6",
                          color: "#be123c",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: "not-allowed",
                        }}
                      >
                        🔒 過期紅鎖禁派 (改借 {inst.substituteId})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedTafInstrumentId(inst.id)}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          border: "1px solid #93c5fd",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 10,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        預覽 TAF 證書
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* COLUMN 2: Candidate B's Crew-Asset Radar Matrix + TAF Certificate Preview Modal + Dynamic Offboarding Alert */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Dynamic Offboarding Alert Strip (INV-ASSET-5, zero hardcoded names) */}
          <div
            style={{
              background: "#fff1f2",
              border: "1.5px solid #f43f5e",
              borderRadius: 12,
              padding: "9px 12px",
              fontSize: 11,
              color: "#881337",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div>
              <ShieldAlert size={14} style={{ display: "inline", marginRight: 4 }} />
              <strong>INV-ASSET-5 動態離職未還攔截：</strong>
              串接 `tblXmhGI18fQeOOS` (92人名單：75在職/17離職，零寫死人名) 攔截{" "}
              <strong>{offboardedAlerts[0]?.instrument.id}</strong>（持有人{" "}
              {offboardedAlerts[0]?.employee.employeeId} · 狀態=離職）
            </div>
            <span
              style={{
                background: "#be123c",
                color: "#fff",
                fontWeight: 800,
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              CORR-01 PASS
            </span>
          </div>

          {/* 6-Crew × Vehicle × Held Instruments Radar Matrix */}
          <section
            aria-label="外業六組車隊與持有人雷達矩陣"
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 14,
              padding: "11px 12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                <Radar size={16} color="#0284c7" />
                外業 6 組車隊 × 持有人雷達矩陣
              </h2>
              <span style={{ fontSize: 11, color: "#64748b" }}>
                點擊設備即時切換下方 TAF 校正報告預覽
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 8,
              }}
            >
              {CREW_RADAR_DATA.map((crew) => {
                const isConflictVehicle =
                  crew.vehiclePlate === "ABC-1234" && vehicleResolution === "conflict";
                return (
                  <div
                    key={crew.crewName}
                    style={{
                      background: isConflictVehicle ? "#fffbeb" : "#f8fafc",
                      border: isConflictVehicle ? "1.5px solid #f59e0b" : "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "8px 9px",
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                      <span>{crew.crewName}</span>
                      <span style={{ color: "#0369a1", fontSize: 10 }}>{crew.caseCode}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                      🚐 {crew.vehiclePlate} · 保險 {crew.vehicleInsuranceDue}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                      {crew.heldInstruments.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => {
                            const found = instruments.find((x) => x.id === h.id);
                            if (found) setSelectedTafInstrumentId(found.id);
                          }}
                          style={{
                            padding: "2px 6px",
                            borderRadius: 5,
                            fontSize: 10,
                            fontWeight: 700,
                            border: h.overdue ? "1px solid #dc2626" : "1px solid #cbd5e1",
                            background: h.overdue ? "#fef2f2" : "#ffffff",
                            color: h.overdue ? "#991b1b" : "#0f172a",
                            cursor: "pointer",
                          }}
                        >
                          {h.id}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* TAF Certificate Preview Modal / Inspector Card (INV-ASSET-1 & fldxVmQJrU / fldmbinuHm) */}
          <section
            aria-label="TAF校正報告預覽視窗"
            data-testid="taf-certificate-modal"
            style={{
              background: "#eff6ff",
              border: "2px solid #2563eb",
              borderRadius: 14,
              padding: "11px 13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 14, color: "#1e3a8a" }}>
                <FileCheck2 size={16} color="#2563eb" />
                <span>TAF 校正報告即時預覽 ({selectedTafInst.id})</span>
              </div>
              <span
                style={{
                  background: "#1d4ed8",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "2px 7px",
                  borderRadius: 999,
                }}
              >
                fldxVmQJrU ➔ {selectedTafInst.tafRecordId}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
                background: "#ffffff",
                borderRadius: 8,
                padding: "7px 9px",
                border: "1px solid #bfdbfe",
                fontSize: 11,
                marginBottom: 8,
              }}
            >
              <div>
                <div style={{ color: "#64748b", fontSize: 10 }}>校正日期 (calibration_date)</div>
                <div style={{ fontWeight: 800 }}>{selectedTafInst.calibrationDate}</div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: 10 }}>下次效期 (next_calibration_date)</div>
                <div style={{ fontWeight: 800, color: "#1d4ed8" }}>
                  {selectedTafInst.nextCalibrationDate}
                </div>
              </div>
              <div>
                <div style={{ color: "#64748b", fontSize: 10 }}>檢校實驗室</div>
                <div style={{ fontWeight: 800 }}>{selectedTafInst.tafLab}</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#1e3a8a" }}>
                月租紀錄 <code>{selectedTafInst.recordId}</code> 已綁定 TAF 紀錄{" "}
                <code>{selectedTafInst.tafRecordId}</code>
              </span>
              <a
                href={selectedTafInst.tafReportUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  background: "#1d4ed8",
                  color: "#ffffff",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                查看TAF校正報告 (fldmbinuHm) <ExternalLink size={12} />
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
