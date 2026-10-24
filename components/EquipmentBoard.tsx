"use client";

import React, { useState, useMemo } from "react";
import {
  Radar,
  Search,
  ExternalLink,
  ShieldAlert,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FileCheck2,
  QrCode,
  Users,
  ArrowRightLeft,
  Camera,
  Calendar,
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

export default function EquipmentBoard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string>("TC1101(622382)");
  const [vehicleMode, setVehicleMode] = useState<"overlap" | "def5678" | "shared">("overlap");
  const [offboardIntercepted, setOffboardIntercepted] = useState(false);

  const selectedInstrument = useMemo(
    () =>
      INITIAL_INSTRUMENTS.find((i) => i.id === selectedInstrumentId) ||
      INITIAL_INSTRUMENTS[1],
    [selectedInstrumentId]
  );

  const offboardedAssets = useMemo(
    () => findDynamicOffboardedAssets(INITIAL_INSTRUMENTS, DYNAMIC_ROSTER_SAMPLE),
    []
  );

  const filteredCrews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return CREW_RADAR_DATA;
    return CREW_RADAR_DATA.filter(
      (c) =>
        c.crewName.toLowerCase().includes(q) ||
        c.vehiclePlate.toLowerCase().includes(q) ||
        c.siteLocation.toLowerCase().includes(q) ||
        c.heldInstruments.some((h) => h.id.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  const dedupDemo = useMemo(
    () =>
      computeDeduplicatedUsageDays(
        selectedInstrument.selectedUsageDates || ["2026-10-20", "2026-10-22", "2026-10-24"]
      ),
    [selectedInstrument]
  );

  return (
    <div
      data-testid="equip-variant-b"
      style={{
        maxWidth: 1380,
        margin: "0 auto",
        padding: "10px 14px 32px",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#0f172a",
      }}
    >
      {/* Top Command Header & Live QR/Serial Quick-Lookup Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          background: "#0f172a",
          color: "#f8fafc",
          padding: "12px 16px",
          borderRadius: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radar size={22} color="#38bdf8" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span>永祥工地車隊 × 組別持有人雷達矩陣 (#43)</span>
              <span
                style={{
                  background: "#0284c7",
                  color: "#fff",
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                Lark-as-DB {LARK_DB_META.baseToken} ({LARK_DB_META.version})
              </span>
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
              全外業 6 組即時持有人 × 車輛 GiST 防衝堂 × TAF 校正報告抽屜 × 動態離職未還攔截
            </div>
          </div>
        </div>

        {/* Live QR / Serial Quick-Lookup Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 10,
            padding: "6px 12px",
            minWidth: 340,
            flex: "1 1 340px",
            maxWidth: 520,
          }}
        >
          <QrCode size={16} color="#38bdf8" />
          <Search size={15} color="#94a3b8" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="QR掃碼或輸入編號秒查位置：TC1101(622382)、GPS S901、ABC-1234..."
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#f8fafc",
              fontSize: 13,
              width: "100%",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              style={{
                background: "#334155",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Offboarding Asset Alert Banner (INV-ASSET-5, CORR-01 zero hardcoded names) */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: "#fff1f2",
          border: "1.5px solid #f43f5e",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#881337" }}>
          <ShieldAlert size={18} color="#e11d48" />
          <div>
            <strong>動態離職人員未還設備攔截 (INV-ASSET-5)：</strong>
            即時讀取 `tblXmhGI18fQeOOS`（92 人名單：75 在職 / 17 離職，<strong>零寫死離職姓名</strong>），偵測到{" "}
            {offboardedAssets.map((a) => (
              <span
                key={a.instrument.id}
                style={{
                  background: "#ffe4e6",
                  border: "1px solid #fda4af",
                  padding: "2px 7px",
                  borderRadius: 6,
                  fontWeight: 800,
                  marginLeft: 4,
                }}
              >
                {a.instrument.id}（持有人編號 {a.employee.employeeId} · 狀態={a.employee.employmentStatus}）
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setSelectedInstrumentId("DNA03(341088)")}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e11d48",
              background: "#ffffff",
              color: "#be123c",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            定位設備詳情
          </button>
          <button
            type="button"
            onClick={() => setOffboardIntercepted(true)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: offboardIntercepted ? "#15803d" : "#e11d48",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {offboardIntercepted ? "✓ 已發送催還與庫房鎖定單" : "🚨 一鍵啟動離職資產追回鎖定"}
          </button>
        </div>
      </div>

      {/* Main Split Grid: Left = 6-Crew Radar Matrix (2x3 grid), Right = Interactive TAF Calibration Certificate Drawer */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.65fr) minmax(340px, 1fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* LEFT: Crew × Vehicle × Held Instruments Radar Matrix */}
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(265px, 1fr))",
              gap: 10,
            }}
          >
            {filteredCrews.map((crew) => {
              const hasConflict =
                crew.vehiclePlate === "ABC-1234" && vehicleMode === "overlap";
              const displayPlate =
                crew.crewName === "地形B" && vehicleMode === "def5678"
                  ? "DEF-5678 (已改派)"
                  : crew.vehiclePlate === "ABC-1234" && vehicleMode === "shared"
                  ? "ABC-1234 (shared=true 共乘)"
                  : crew.vehiclePlate;

              return (
                <div
                  key={crew.crewName}
                  style={{
                    background: "#ffffff",
                    border: hasConflict
                      ? "2px solid #f59e0b"
                      : "1px solid #cbd5e1",
                    borderRadius: 12,
                    padding: "11px 12px",
                    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                  }}
                >
                  {/* Crew Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 15, color: "#0f172a" }}>
                      {crew.crewName}
                    </span>
                    <span
                      style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 6,
                      }}
                    >
                      案號 {crew.caseCode}
                    </span>
                  </div>

                  <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>
                    📍 駐點位置：{crew.siteLocation}
                  </div>

                  {/* Vehicle Badge & GiST Overlap Guard */}
                  <div
                    style={{
                      background: hasConflict ? "#fffbeb" : "#f8fafc",
                      border: `1px solid ${hasConflict ? "#fcd34d" : "#e2e8f0"}`,
                      borderRadius: 8,
                      padding: "6px 8px",
                      marginBottom: 8,
                      fontSize: 11,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 800, color: "#0f172a" }}>
                        🚐 車輛：{displayPlate}
                      </span>
                      <span style={{ fontSize: 10, color: "#64748b" }}>
                        保養 {crew.vehicleMaintDue}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                      保險到期：{crew.vehicleInsuranceDue}
                    </div>
                    {crew.vehiclePlate === "ABC-1234" && (
                      <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => setVehicleMode("def5678")}
                          style={{
                            flex: 1,
                            padding: "4px 6px",
                            fontSize: 10,
                            fontWeight: 800,
                            borderRadius: 6,
                            border: "1px solid #d97706",
                            background: vehicleMode === "def5678" ? "#dcfce7" : "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          改派 DEF-5678
                        </button>
                        <button
                          type="button"
                          onClick={() => setVehicleMode("shared")}
                          style={{
                            flex: 1,
                            padding: "4px 6px",
                            fontSize: 10,
                            fontWeight: 800,
                            borderRadius: 6,
                            border: "1px solid #0284c7",
                            background: vehicleMode === "shared" ? "#dcfce7" : "#f0f9ff",
                            color: "#0369a1",
                            cursor: "pointer",
                          }}
                        >
                          共乘 (shared=true)
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Held Instruments List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {crew.heldInstruments.map((inst) => {
                      const isSelected = selectedInstrumentId === inst.id;
                      return (
                        <div
                          key={inst.id}
                          onClick={() => {
                            const found = INITIAL_INSTRUMENTS.find((x) => x.id === inst.id);
                            if (found) setSelectedInstrumentId(found.id);
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: isSelected
                              ? "1.5px solid #2563eb"
                              : inst.overdue
                              ? "1px solid #fca5a5"
                              : "1px solid #e2e8f0",
                            background: isSelected
                              ? "#eff6ff"
                              : inst.overdue
                              ? "#fef2f2"
                              : "#ffffff",
                            cursor: "pointer",
                            fontSize: 11,
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 800, color: "#0f172a" }}>{inst.id}</span>
                            <span style={{ color: "#64748b", marginLeft: 5, fontSize: 10 }}>
                              {inst.category} · {inst.rentType}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {inst.overdue && (
                              <span
                                style={{
                                  background: "#dc2626",
                                  color: "#fff",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                }}
                              >
                                逾期未還
                              </span>
                            )}
                            <span
                              style={{
                                background:
                                  inst.tafStatus === "即將到期" ? "#fef3c7" : "#dcfce7",
                                color:
                                  inst.tafStatus === "即將到期" ? "#92400e" : "#166534",
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "1px 5px",
                                borderRadius: 4,
                              }}
                            >
                              TAF {inst.tafStatus}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Interactive TAF Calibration Certificate Drawer & Hard-Lock Inspector */}
        <aside
          aria-label="TAF校正報告抽屜與硬鎖定檢核器"
          style={{
            background: "#ffffff",
            border: "2px solid #1d4ed8",
            borderRadius: 14,
            padding: "14px",
            boxShadow: "0 8px 24px rgba(29, 78, 216, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileCheck2 size={18} color="#1d4ed8" />
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                TAF 校正報告抽屜 & 效期檢核器
              </h2>
            </div>
            <span
              style={{
                background: "#dbeafe",
                color: "#1e40af",
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: 999,
              }}
            >
              INV-ASSET-1 / 2
            </span>
          </div>

          {/* Quick Instrument Selector Tabs in Drawer */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
            {["TC1101(622382)", "TS15P(511094)", "GPS S901", "DNA03(341088)"].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedInstrumentId(id)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 800,
                  border: selectedInstrumentId === id ? "1.5px solid #1d4ed8" : "1px solid #cbd5e1",
                  background: selectedInstrumentId === id ? "#1d4ed8" : "#f8fafc",
                  color: selectedInstrumentId === id ? "#ffffff" : "#334155",
                  cursor: "pointer",
                }}
              >
                {id}
              </button>
            ))}
          </div>

          {/* Selected Instrument Certificate Card */}
          <div
            style={{
              background:
                selectedInstrument.calibrationStatus === "校正過期"
                  ? "#fff1f2"
                  : "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: 10,
              padding: "12px",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{selectedInstrument.id}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{selectedInstrument.name}</div>
              </div>
              <span
                style={{
                  background:
                    selectedInstrument.calibrationStatus === "校正過期"
                      ? "#dc2626"
                      : selectedInstrument.calibrationStatus === "即將到期"
                      ? "#f59e0b"
                      : "#16a34a",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                {selectedInstrument.calibrationStatus}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 10,
                padding: "8px",
                background: "#ffffff",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 11,
              }}
            >
              <div>
                <div style={{ color: "#64748b" }}>校正日期 (calibration_date)</div>
                <div style={{ fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                  {selectedInstrument.calibrationDate}
                </div>
              </div>
              <div>
                <div style={{ color: "#64748b" }}>下次效期 (next_calibration_date)</div>
                <div
                  style={{
                    fontWeight: 800,
                    color:
                      selectedInstrument.calibrationStatus === "校正過期"
                        ? "#dc2626"
                        : "#1d4ed8",
                    marginTop: 2,
                  }}
                >
                  {selectedInstrument.nextCalibrationDate}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "#334155", marginTop: 8 }}>
              <div>
                <strong>月租設備紀錄：</strong>
                <code>{selectedInstrument.recordId}</code> · <strong>TAF 紀錄：</strong>
                <code>{selectedInstrument.tafRecordId}</code>
              </div>
              <div style={{ marginTop: 3 }}>
                <strong>檢校機構：</strong>
                {selectedInstrument.tafLab}
              </div>
            </div>

            {/* Direct Hyperlink Verification (fldxVmQJrU / fldmbinuHm) */}
            <a
              href={selectedInstrument.tafReportUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="taf-report-hyperlink"
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                background: "#1d4ed8",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              🔗 查看TAF校正報告 (fldxVmQJrU / fldmbinuHm)
              <ExternalLink size={13} />
            </a>
          </div>

          {/* INV-ASSET-2 Expired Hard-Lock Box */}
          <div
            style={{
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 10,
              padding: "10px",
              marginBottom: 10,
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 800, color: "#9f1239", display: "flex", alignItems: "center", gap: 5 }}>
              <Lock size={13} />
              INV-ASSET-2 校正過期硬鎖定檢核 (fldlP8i9r3)
            </div>
            <div style={{ color: "#881337", marginTop: 4 }}>
              全站儀 <strong>TS15P(511094)</strong> 效期 2026-09-29 已屆滿，借用按鈕直接紅鎖 Disable，系統自動指派合格替代品{" "}
              <strong>TS16P(651591)</strong>。
            </div>
          </div>

          {/* INV-ASSET-5 Monthly Photo (1 photo passes) & Multi-Date Deduplication Summary */}
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 10,
              padding: "10px",
              fontSize: 11,
              color: "#14532d",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              ✅ v2.1.0 歸還與月租檢核欄位即時狀態
            </div>
            <div>
              • <strong>月租照片 (fldkKrBoKq / fldsgbnQo4)：</strong>單張即合格（1 張照片 = 檢核通過）
            </div>
            <div style={{ marginTop: 3 }}>
              • <strong>實際使用天數 (fldjH7l0vd)：</strong>多選日期去重計數 ={" "}
              <strong>{dedupDemo.count} 天</strong>（不自動填補中間空檔）
            </div>
            <div style={{ marginTop: 3 }}>
              • <strong>日期格式檢核 (fldSLwUkKd)：</strong>舊資料缺年份（如{" "}
              <code>08/15</code>）自動標記 <code>待確認</code>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
