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
  Sparkles,
  ArrowRightLeft,
  QrCode,
} from "lucide-react";
import {
  LARK_DB_META,
  INITIAL_INSTRUMENTS,
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
  const [returnDone, setReturnDone] = useState(false);
  const [monthlyPhotoUploaded, setMonthlyPhotoUploaded] = useState(false);
  const [vehicleResolution, setVehicleResolution] = useState<"conflict" | "reassigned_DEF5678" | "shared_true">("conflict");
  const [bundleClaimed, setBundleClaimed] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([
    "2026-10-19",
    "2026-10-21",
    "2026-10-23",
    "2026-10-21", // duplicate entry to demonstrate automatic deduplication (fldjH7l0vd)
  ]);
  const [legacyDateInput, setLegacyDateInput] = useState<string>("01/15");
  const [activeTafModal, setActiveTafModal] = useState<InstrumentItem | null>(null);

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
        (i) => i.holderEmployeeId === "EMP-011" && (i.status === "逾期未還" || i.status === "已借出")
      ),
    [instruments]
  );

  const filteredList = useMemo(() => {
    switch (activeChip) {
      case "available":
        return instruments.filter((i) => i.status === "可借用");
      case "overdue":
        return instruments.filter((i) => i.status === "逾期未還");
      case "taf_alert":
        return instruments.filter(
          (i) => i.calibrationStatus === "即將到期" || i.calibrationStatus === "校正過期"
        );
      case "monthly_photo":
        return instruments.filter((i) => i.rentType === "月租型" && !i.monthlyPhotoVerified);
      case "offboarded":
        return offboardedAlerts.map((a) => a.instrument);
      default:
        return instruments;
    }
  }, [instruments, activeChip, offboardedAlerts]);

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

  const legacyNeedsYearConfirm = !/^\d{4}-\d{2}-\d{2}$/.test(legacyDateInput.trim());

  return (
    <div
      data-testid="equip-variant-a"
      style={{
        maxWidth: 520,
        margin: "0 auto",
        padding: "8px 10px 32px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0f172a",
      }}
    >
      {/* Compact Field Status Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0f172a",
          color: "#f8fafc",
          padding: "8px 12px",
          borderRadius: 10,
          marginBottom: 10,
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
          <QrCode size={15} color="#38bdf8" />
          <span>永祥外業極速借還 #43</span>
          <span
            style={{
              background: "#1e293b",
              color: "#94a3b8",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            Lark-as-DB {LARK_DB_META.version}
          </span>
        </div>
        <div style={{ color: "#38bdf8", fontWeight: 600 }}>
          古恆安 · 地形A
        </div>
      </div>

      {/* SECTION 1: 我的借用中設備（2台） + Giant 1-Tap Photo Return */}
      <section
        aria-label="我的借用中設備"
        style={{
          background: "#ffffff",
          border: "2px solid #dc2626",
          borderRadius: 14,
          padding: "12px",
          marginBottom: 12,
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
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              置頂追蹤 vewbFQ1Mbf
            </span>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
              我的借用中設備（{myBorrowed.length}台）
            </h2>
          </div>
          <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>
            INV-ASSET-3 逾期警示
          </span>
        </div>

        {/* Device Cards in Section 1 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {/* Overdue GPS S901 */}
          <div
            style={{
              background: returnDone ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${returnDone ? "#86efac" : "#fecaca"}`,
              borderRadius: 10,
              padding: "9px 10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 14, color: "#991b1b" }}>
                  GPS S901
                </span>
                <span style={{ fontSize: 12, color: "#475569", marginLeft: 6 }}>
                  Stonex GNSS · 日租型 · C115055-1
                </span>
              </div>
              <span
                style={{
                  background: returnDone ? "#16a34a" : "#dc2626",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 6,
                }}
              >
                {returnDone ? "已拍照歸還 ✅" : "🚨 逾期未還 (應還 10/23)"}
              </span>
            </div>

            {/* Multi-date deduplicated day counter (fldjH7l0vd & fldSLwUkKd) */}
            <div
              style={{
                marginTop: 7,
                paddingTop: 6,
                borderTop: "1px dashed #fca5a5",
                fontSize: 11,
                color: "#334155",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>
                  <CalendarCheck size={12} style={{ display: "inline", marginRight: 3 }} />
                  實際使用日期多選自動去重 (fldjH7l0vd)：
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
                  共 {dedupResult.count} 天（不補中間空檔）
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
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {dt.slice(5)} {active ? "✓" : "+"}
                    </button>
                  );
                })}
                <span
                  title="舊資料缺年份自動標記待確認 (fldSLwUkKd)"
                  style={{
                    background: legacyNeedsYearConfirm ? "#fef3c7" : "#dcfce7",
                    color: legacyNeedsYearConfirm ? "#92400e" : "#166534",
                    border: "1px solid #fcd34d",
                    borderRadius: 6,
                    padding: "2px 6px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  舊格式「{legacyDateInput}」檢核 (fldSLwUkKd):{" "}
                  {legacyNeedsYearConfirm ? "⚠ 待確認(缺年份)" : "✓ 正常"}
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
              padding: "9px 10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>
                  TC1101(622382)
                </span>
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
                  setActiveTafModal(instruments.find((x) => x.id === "TC1101(622382)") || null);
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
                  fontSize: 11,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                查看TAF校正報告 <ExternalLink size={11} />
              </a>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 5,
                fontSize: 11,
                color: "#475569",
              }}
            >
              <span>
                月租照片檢核 (fldkKrBoKq / fldsgbnQo4)：
                <strong style={{ color: monthlyPhotoUploaded ? "#15803d" : "#b45309", marginLeft: 4 }}>
                  {monthlyPhotoUploaded ? "✅ 單張照片已合格 (1/1)" : "⏳ 待補拍 1 張照片即可通過"}
                </strong>
              </span>
              <span style={{ fontSize: 10, color: "#64748b" }}>校正日 2025-11-10</span>
            </div>
          </div>
        </div>

        {/* GIANT 1-TAP BUTTON */}
        <button
          type="button"
          onClick={handleOneTapPhotoReturn}
          data-testid="one-tap-photo-return-btn"
          style={{
            width: "100%",
            minHeight: 54,
            background: returnDone
              ? "linear-gradient(135deg, #15803d, #16a34a)"
              : "linear-gradient(135deg, #dc2626, #ea580c)",
            color: "#ffffff",
            border: "none",
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(220, 38, 38, 0.28)",
          }}
        >
          <Camera size={20} />
          {returnDone
            ? "✅ 已上傳單張照片完成歸還（去重計 3 天 · 寫入系統申請紀錄）"
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
          padding: "12px",
          marginBottom: 12,
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#0f172a" }}>
            ⚡ 今日預排案件 C115055-1 一鍵領用建議組合（全站儀 + GPS + 車輛）
          </h2>
          <span
            style={{
              background: "#f1f5f9",
              color: "#334155",
              fontSize: 10,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 6,
            }}
          >
            地形A 苗栗竹南
          </span>
        </div>

        {/* Recommended Combo Row: Total Station (showing INV-ASSET-2 auto-substitute) + GPS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 8,
            fontSize: 11,
          }}
        >
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "7px 8px",
            }}
          >
            <div style={{ color: "#dc2626", fontWeight: 700, textDecoration: "line-through", fontSize: 10 }}>
              🔒 TS15P(511094) 校正過期禁派
            </div>
            <div style={{ color: "#0f172a", fontWeight: 800, marginTop: 2 }}>
              ✅ 全站儀：TS16P(651591)
            </div>
            <div style={{ color: "#15803d", fontSize: 10 }}>
              INV-ASSET-2 自動替換合格設備
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "7px 8px",
            }}
          >
            <div style={{ color: "#64748b", fontSize: 10 }}>GPS / RTK 組合</div>
            <div style={{ color: "#0f172a", fontWeight: 800, marginTop: 2 }}>
              ✅ GS18T(782190)
            </div>
            <div style={{ color: "#0369a1", fontSize: 10 }}>
              TAF 效期至 2027-04-09
            </div>
          </div>
        </div>

        {/* Live GiST Vehicle Overlap Guard (INV-ASSET-4) */}
        <div
          style={{
            background: vehicleResolution === "conflict" ? "#fffbeb" : "#f0fdf4",
            border: `1.5px solid ${vehicleResolution === "conflict" ? "#f59e0b" : "#22c55e"}`,
            borderRadius: 10,
            padding: "9px 10px",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontWeight: 800, fontSize: 12, color: "#92400e", display: "flex", alignItems: "center", gap: 4 }}>
              <Truck size={14} />
              {vehicleResolution === "conflict"
                ? "⚠️ 明日地形B已排 ABC-1234（GiST period && 區間重疊防呆）"
                : vehicleResolution === "reassigned_DEF5678"
                ? "✅ 已改派空車 DEF-5678（無重疊衝突 · 保險/保養正常）"
                : "✅ 已設為兩組共乘 ABC-1234 (shared=true · 地形A+地形B)"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309" }}>INV-ASSET-4</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <button
              type="button"
              onClick={() => setVehicleResolution("reassigned_DEF5678")}
              style={{
                padding: "7px 8px",
                borderRadius: 8,
                border: vehicleResolution === "reassigned_DEF5678" ? "2px solid #16a34a" : "1px solid #d97706",
                background: vehicleResolution === "reassigned_DEF5678" ? "#dcfce7" : "#ffffff",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <ArrowRightLeft size={13} />
              改派 DEF-5678
            </button>
            <button
              type="button"
              onClick={() => setVehicleResolution("shared_true")}
              style={{
                padding: "7px 8px",
                borderRadius: 8,
                border: vehicleResolution === "shared_true" ? "2px solid #16a34a" : "1px solid #0284c7",
                background: vehicleResolution === "shared_true" ? "#dcfce7" : "#f0f9ff",
                color: "#0369a1",
                fontWeight: 800,
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <Users size={13} />
              兩組共乘 (shared=true)
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
            minHeight: 44,
            borderRadius: 10,
            border: "none",
            background: bundleClaimed ? "#0f172a" : "#2563eb",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {bundleClaimed
            ? "✓ 已領用 C115055-1 組合（TS16P + GS18T + " +
              (vehicleResolution === "shared_true" ? "ABC-1234共乘" : "DEF-5678") +
              "）"
            : "🚀 一鍵領用今日預排建議組合（自動避開過期設備與衝堂車）"}
        </button>
      </section>

      {/* SECTION 3: Instant Filter Chips & 1-Thumb Cards */}
      <section aria-label="即時篩選與設備清單">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 10,
          }}
        >
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
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  border: active ? "1.5px solid #0f172a" : "1px solid #cbd5e1",
                  background: active ? "#0f172a" : "#ffffff",
                  color: active ? "#ffffff" : "#334155",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Dynamic Offboarding Alert Strip (INV-ASSET-5, zero hardcoded names) */}
        {offboardedAlerts.length > 0 && (
          <div
            style={{
              background: "#fdf2f8",
              border: "1px solid #f472b6",
              borderRadius: 10,
              padding: "7px 10px",
              marginBottom: 8,
              fontSize: 11,
              color: "#831843",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              <ShieldAlert size={13} style={{ display: "inline", marginRight: 4 }} />
              <strong>INV-ASSET-5 動態離職未還告警：</strong>
              即時串接 92 人名單 (17 離職) 攔截{" "}
              <strong>{offboardedAlerts[0].instrument.id}</strong>（持有人編號{" "}
              {offboardedAlerts[0].employee.employeeId} · 狀態={offboardedAlerts[0].employee.employmentStatus}）
            </span>
            <span style={{ fontWeight: 800, fontSize: 10, background: "#be185d", color: "#fff", padding: "2px 6px", borderRadius: 4 }}>
              零寫死名單
            </span>
          </div>
        )}

        {/* Compact Card List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredList.slice(0, 4).map((inst) => {
            const isExpired = inst.calibrationStatus === "校正過期";
            return (
              <div
                key={inst.id}
                style={{
                  background: isExpired ? "#fff1f2" : "#ffffff",
                  border: isExpired ? "1.5px solid #f43f5e" : "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: "9px 11px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{inst.id}</span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "#f1f5f9",
                        color: "#475569",
                        fontWeight: 700,
                      }}
                    >
                      {inst.rentType}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontWeight: 700,
                        background:
                          inst.calibrationStatus === "校正過期"
                            ? "#dc2626"
                            : inst.calibrationStatus === "即將到期"
                            ? "#f59e0b"
                            : "#dcfce7",
                        color:
                          inst.calibrationStatus === "有效" ? "#166534" : "#ffffff",
                      }}
                    >
                      TAF {inst.calibrationStatus} ({inst.nextCalibrationDate})
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                    {inst.name} · {inst.locationNote}
                  </div>
                </div>

                {/* Action Button: Disabled hard-lock if expired (INV-ASSET-2) */}
                {isExpired ? (
                  <button
                    type="button"
                    disabled
                    title="INV-ASSET-2: 校正過期禁止派用 (fldlP8i9r3)"
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "1px solid #f43f5e",
                      background: "#ffe4e6",
                      color: "#be123c",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "not-allowed",
                      whiteSpace: "nowrap",
                    }}
                  >
                    🔒 過期禁派 (改借 {inst.substituteId})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTafModal(inst)}
                    style={{
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#f8fafc",
                      color: "#0f172a",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inst.status === "可借用" ? "⚡ 單手秒借" : "📄 TAF / 詳情"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* TAF Modal if clicked */}
      {activeTafModal && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            background: "#eff6ff",
            border: "1px solid #60a5fa",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
            <span>TAF 校正報告連結檢視 ({activeTafModal.id})</span>
            <button
              type="button"
              onClick={() => setActiveTafModal(null)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 800 }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 4, color: "#1e3a8a" }}>
            校正日期 (calibration_date): {activeTafModal.calibrationDate} ｜ 下次校正效期 (next_calibration_date):{" "}
            {activeTafModal.nextCalibrationDate}
          </div>
          <div style={{ marginTop: 4 }}>
            <a href={activeTafModal.tafReportUrl} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", fontWeight: 700 }}>
              🔗 點擊開啟 Lark TAF 報告紀錄 ({activeTafModal.tafRecordId})
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
