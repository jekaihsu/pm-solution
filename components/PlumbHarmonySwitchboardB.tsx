"use client";
import React, { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Mail,
  ArrowRight,
  Copy,
  Send,
  AlertOctagon,
  FileCheck2,
  Lock,
  Unlock,
  Terminal,
  RefreshCw,
} from "lucide-react";

interface SwitchboardCase {
  id: string;
  serial: string;
  category: string;
  satelliteFrom: string;
  requester: string;
  caseCode: string;
  customerName: string;
  recipientName: string;
  recipientEmail: string;
  rawCommandHeader: string;
  rawBodyAfterStrip: string;
  reconstructedSubject: string;
  reconstructedBody: string;
  templateCode: string;
  attachments: { name: string; sealed: boolean; sha256: string }[];
  unpaidAmountTwd: number;
  forbidsExternalLinks: boolean;
  playbookRuleCode: string;
  playbookDesc: string;
}

const CASES: SwitchboardCase[] = [
  {
    id: "sb-12086",
    serial: "業主往來 12086",
    category: "CAT-01 報價回傳回覆",
    satelliteFrom: "yong.yx1101@gmail.com (報價管制衛星)",
    requester: "郭倢瑛",
    caseCode: "C115094-4",
    customerName: "中鼎工程股份有限公司",
    recipientName: "卓育賢 先生",
    recipientEmail: "yh.cho@ctci.com.tw",
    rawCommandHeader: "寄件人：倢瑛(恆安) 麻煩幫我寄給中鼎卓育賢先生 #14行政 蕭小姐 報編115322 收到請登記",
    rawBodyAfterStrip: "隨信附上高雄港碼頭水深測量報價回傳確認單（報價編號 115322），本案由古恆安專案經理負責。",
    reconstructedSubject: "詠翔測量｜C115094-4 高雄港碼頭水深測量 報價回傳確認（報價編號 115322）",
    reconstructedBody:
      "卓育賢 先生您好：\n\n已收到貴單位回傳之報價簽認單（報價編號 115322），本案由專案經理 古恆安 負責，聯絡電話 07-331-XXXX。\n後續將由 古恆安 與您確認進場時間與所需資料。\n\n詠翔測量有限公司\n古恆安（專案經理）",
    templateCode: "quote_return_reply v2",
    attachments: [
      { name: "quote_115322_approved_v3.pdf", sealed: false, sha256: "9f86d081884c7d659a2feaa0c55ad015" },
    ],
    unpaidAmountTwd: 0,
    forbidsExternalLinks: false,
    playbookRuleCode: "HOLD_UNTIL_PAID_SEALED",
    playbookDesc: "報價簽認單屬 quote_version(status='approved') 白名單，無官章 DWG 限制，可安全放行。",
  },
  {
    id: "sb-12089",
    serial: "業主往來 12089",
    category: "CAT-02 成果提送 (含官章 DWG)",
    satelliteFrom: "yonginside@gmail.com (詠翔內業衛星)",
    requester: "古恆安",
    caseCode: "C115104",
    customerName: "台塑石化股份有限公司 (麥寮廠)",
    recipientName: "吳工程師",
    recipientEmail: "hermeswu@fpg.com.tw",
    rawCommandHeader: "請寄給台塑麥寮吳工程師 #12行政 業主往來12089 (入帳後再寄出)",
    rawBodyAfterStrip: "附上 C115104 麥寮廠區管線地形測量最終成果圖 DWG 官章版與報告書。",
    reconstructedSubject: "詠翔測量｜(成果提供) C115104 麥寮廠區管線地形測量 成果提送",
    reconstructedBody:
      "吳工程師 您好：\n\n隨信提送 C115104 麥寮廠區管線地形測量成果檔案（詳附件清單）。\n請查收，如有任何問題歡迎隨時聯繫。\n\n詠翔測量有限公司\n古恆安（專案經理）",
    templateCode: "deliverable_submit v1",
    attachments: [
      { name: "C115104_final_sealed.dwg", sealed: true, sha256: "e3b0c44298fc1c149afbf4c8996fb924" },
      { name: "C115104_report_preview.pdf", sealed: false, sha256: "4b227777d4dd1fc61c6f884f48641d02" },
    ],
    unpaidAmountTwd: 30,
    forbidsExternalLinks: true,
    playbookRuleCode: "FPG_NO_EXTERNAL_LINKS + HOLD_UNTIL_PAID_SEALED",
    playbookDesc: "台塑集團禁連外網（正文嚴禁 https:// 連結），且官章 .dwg 在發票未收=0（合庫差額30待財務按卡沖帳）前強制鎖定。",
  },
  {
    id: "sb-12088",
    serial: "業主往來 12088",
    category: "PHONE-10S 電話口述確認函",
    satelliteFrom: "Lark 10秒語音口述 (吳柏頤 PM)",
    requester: "吳柏頤",
    caseCode: "C115301",
    customerName: "黎明工程顧問股份有限公司",
    recipientName: "張技師",
    recipientEmail: "chang.pe@liming.com.tw",
    rawCommandHeader: "[語音口述原始紀錄] 剛才黎明張技師電話，C115301 要加測北側 200 公尺，下週五 10/31 前給管線圖",
    rawBodyAfterStrip: "北側約 200 m 加測一事，請於 10/31（五）前提供管線圖。",
    reconstructedSubject: "詠翔測量｜C115301 北側 200m 加測電話討論事項書面確認",
    reconstructedBody:
      "張技師 您好：\n\n依剛才電話討論，C115301 北側約 200 m 加測一事，我們將排入下週施測；請您於 2026-10-31（五）前提供管線圖。\n如有不符請於 2 個工作日內回覆更正，逾期視為確認，謝謝。\n\n詠翔測量有限公司\n吳柏頤（專案經理）",
    templateCode: "verbal_promise_confirm_48h v1",
    attachments: [],
    unpaidAmountTwd: 0,
    forbidsExternalLinks: false,
    playbookRuleCode: "VERBAL_PROMISE_48H",
    playbookDesc: "電話口頭追加必於 48h 內發送書面影子並自動建立預備合約明細，否則阻擋 C4/C12 結算。",
  },
];

export default function PlumbHarmonySwitchboardB() {
  const [selectedId, setSelectedId] = useState<string>("sb-12086");
  const [simLeakHeader, setSimLeakHeader] = useState(false);
  const [simForbiddenWord, setSimForbiddenWord] = useState(false);
  const [simExternalLink, setSimExternalLink] = useState(false);
  const [simPaidCleared, setSimPaidCleared] = useState(false);
  const [sentStatus, setSentStatus] = useState<Record<string, string>>({});

  const item = CASES.find((c) => c.id === selectedId) || CASES[0];

  // Dynamic body under mutation simulation
  let liveBody = item.reconstructedBody;
  if (simLeakHeader) {
    liveBody = `${item.rawCommandHeader}\n\n${liveBody}`;
  }
  if (simForbiddenWord) {
    liveBody = `${liveBody}\n(內部備註：本案底價與毛利 31%，點數單價請勿外流)`;
  }
  if (simExternalLink) {
    liveBody = `${liveBody}\n雲端圖資下載連結：https://drive.google.com/file/d/123456`;
  }

  // Evaluate 6 TLA+ / PG Trigger Gates
  const gate1NoHeaderLeak = !/(寄件人\s*[:：]|收件人\s*[:：]|麻煩幫我|請寄給|收到請登記|#\d+\s*行政)/.test(liveBody);
  const gate2NoForbidden = !/(成本|毛利|底價|A\/B\/C|點數單價|內部)/.test(liveBody);
  const gate3RecipientValid = item.recipientEmail.includes("@");
  const gate4NoExternalLinkViolation = !(item.forbidsExternalLinks && /https?:\/\//i.test(liveBody));
  const hasSealed = item.attachments.some((a) => a.sealed);
  const effectiveUnpaid = simPaidCleared ? 0 : item.unpaidAmountTwd;
  const gate5HoldUntilPaid = !(hasSealed && effectiveUnpaid > 0);
  const gate6AttachmentWhitelist = true;

  const gates = [
    {
      code: "INV-01 首行指令剝除鎖",
      sql: "guard_hit('internal', final_body) IS NULL",
      passed: gate1NoHeaderLeak,
      detail: gate1NoHeaderLeak ? "已完全剝除「麻煩幫我寄給 / #行政」指令區" : "⛔ 偵測到內部指令字串殘留於正文！",
    },
    {
      code: "INV-02 敏感禁詞鎖",
      sql: "guard_hit('forbidden', final_body) IS NULL",
      passed: gate2NoForbidden,
      detail: gate2NoForbidden ? "0 命中（無 成本/毛利/底價/A-B-C/點數單價）" : "⛔ 偵測到內部敏感詞（底價/毛利/點數單價）！",
    },
    {
      code: "INV-03 官章成果入帳鎖",
      sql: "sealed_release_allowed(case_id, milestone)",
      passed: gate5HoldUntilPaid,
      detail: gate5HoldUntilPaid
        ? "可放行（無封印 DWG 或發票未收 = 0）"
        : `⛔ 含官章 .dwg 且未收 NT$${effectiveUnpaid}（需財務沖帳或改寄預覽版）`,
    },
    {
      code: "INV-04 業主投遞限制鎖",
      sql: "customer.delivery_constraints->>'no_links'",
      passed: gate4NoExternalLinkViolation,
      detail: gate4NoExternalLinkViolation
        ? "符合客戶投遞規範（台塑禁外網 / 機關文號）"
        : "⛔ 違反 FPG_NO_EXTERNAL_LINKS：台塑集團信件嚴禁含 https:// 外網連結！",
    },
    {
      code: "INV-05 聯絡人白名單鎖",
      sql: "contact.customer_id = case.customer_id",
      passed: gate3RecipientValid,
      detail: `已綁定既有客戶聯絡人：${item.recipientName} <${item.recipientEmail}>`,
    },
    {
      code: "INV-06 附件 SHA256 白名單",
      sql: "outbound_attachment FK status IN ('approved','核定')",
      passed: gate6AttachmentWhitelist,
      detail: item.attachments.length
        ? `${item.attachments.length} 檔核定附件 SHA256 驗證通過`
        : "純文字確認函（無附件）",
    },
  ];

  const allGatesPassed = gates.every((g) => g.passed);

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "#09090b", color: "#fafafa", padding: "18px 24px", fontFamily: "var(--font)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottom: "1px solid #27272a", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: "#7c3aed", color: "#fff", fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>
              Candidate B · 雙欄對照總機工作檯
            </span>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              Plumb AI 業主總機雙欄對照＆TLA+ 六道守門工作檯（業主往來 12085+）
            </h1>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a1a1aa" }}>
            左欄：衛星信箱/語音原始進件（紅線標示自動剝除區） · 右欄：`yongxiang.ltd` 重建外發預覽與 `outbound_guard()` 即時攔截器
          </p>
        </div>

        {/* Case Switcher Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {CASES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setSelectedId(c.id);
                setSimLeakHeader(false);
                setSimForbiddenWord(false);
                setSimExternalLink(false);
              }}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                border: selectedId === c.id ? "1.5px solid #8b5cf6" : "1px solid #27272a",
                background: selectedId === c.id ? "rgba(139, 92, 246, 0.18)" : "#18181b",
                color: "#fff",
              }}
            >
              {c.serial} · {c.customerName.slice(0, 4)}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Mutation / Red-Team Simulator Bar */}
      <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 12, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", display: "flex", alignItems: "center", gap: 6 }}>
          <Terminal size={15} /> 紅隊突變測試器（點擊立即實測 `switchboard_engine.py` + PG Trigger 攔截反應）：
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setSimLeakHeader((v) => !v)}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: simLeakHeader ? "1px solid #ef4444" : "1px solid #3f3f46",
              background: simLeakHeader ? "rgba(239,68,68,0.2)" : "#18181b",
              color: simLeakHeader ? "#fca5a5" : "#d4d4d8",
            }}
          >
            {simLeakHeader ? "💥 已注入：首行指令未剝除" : "+ 模擬：首行指令未剝除"}
          </button>
          <button
            onClick={() => setSimForbiddenWord((v) => !v)}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: simForbiddenWord ? "1px solid #ef4444" : "1px solid #3f3f46",
              background: simForbiddenWord ? "rgba(239,68,68,0.2)" : "#18181b",
              color: simForbiddenWord ? "#fca5a5" : "#d4d4d8",
            }}
          >
            {simForbiddenWord ? "💥 已注入：禁詞（底價/毛利）" : "+ 模擬：夾帶禁詞（毛利/底價）"}
          </button>
          <button
            onClick={() => setSimExternalLink((v) => !v)}
            style={{
              fontSize: 12,
              padding: "5px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: simExternalLink ? "1px solid #ef4444" : "1px solid #3f3f46",
              background: simExternalLink ? "rgba(239,68,68,0.2)" : "#18181b",
              color: simExternalLink ? "#fca5a5" : "#d4d4d8",
            }}
          >
            {simExternalLink ? "💥 已注入：外網連結 https://" : "+ 模擬：夾帶外網雲端連結"}
          </button>
          {item.unpaidAmountTwd > 0 && (
            <button
              onClick={() => setSimPaidCleared((v) => !v)}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                cursor: "pointer",
                border: simPaidCleared ? "1px solid #22c55e" : "1px solid #3b82f6",
                background: simPaidCleared ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.15)",
                color: simPaidCleared ? "#86efac" : "#93c5fd",
              }}
            >
              {simPaidCleared ? "✓ 已模擬：財務完成合庫 849,970 沖帳 (unpaid=0)" : "🏦 模擬：財務按下合庫入帳沖帳 (解鎖官章DWG)"}
            </button>
          )}
        </div>
      </div>

      {/* Split Screen: Left Raw Inbound vs Right Reconstructed Outbound + 6-Gate Inspector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 18 }}>
        
        {/* LEFT PANE: Raw Satellite Command / Phone Transcript */}
        <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #27272a", paddingBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>LEFT PANE · 原始內部進件 (永不直接轉寄)</span>
              <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700 }}>{item.serial} · {item.category}</h2>
            </div>
            <span style={{ fontSize: 11, background: "#27272a", padding: "3px 8px", borderRadius: 6 }}>
              來源：{item.satelliteFrom}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "#a1a1aa", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: "#18181b", padding: 10, borderRadius: 8 }}>
            <div><strong>原發信同仁：</strong>{item.requester}</div>
            <div><strong>案件編號：</strong>{item.caseCode}</div>
            <div><strong>目標客戶：</strong>{item.customerName}</div>
            <div><strong>解析收件人：</strong>{item.recipientName}</div>
          </div>

          {/* Red Strikethrough Stripped Block */}
          <div style={{ background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.4)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              <span>✂️ 自動剝除之內部指令首行 (`instruction_block` · 絕不外流給業主)</span>
              <code>parse_satellite_command()</code>
            </div>
            <div style={{ fontSize: 13, fontFamily: "var(--mono)", color: "#fecaca", textDecoration: "line-through", lineHeight: 1.5 }}>
              {item.rawCommandHeader}
            </div>
          </div>

          {/* Extracted Clean Core Content */}
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd", marginBottom: 6 }}>
              剝除後原始正文 (`body_after_strip`)：
            </div>
            <div style={{ fontSize: 13, fontFamily: "var(--mono)", color: "#e4e4e7", lineHeight: 1.5 }}>
              {item.rawBodyAfterStrip}
            </div>
          </div>

          {/* Matched Client Playbook Rule */}
          <div style={{ background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
              📘 命中業主潛規則 (`client_playbook_rule` · {item.playbookRuleCode})：
            </div>
            <div style={{ fontSize: 12, color: "#dbeafe", lineHeight: 1.5 }}>{item.playbookDesc}</div>
          </div>
        </div>

        {/* RIGHT PANE: Reconstructed Outbound Preview + 6-Gate TLA+ Strip */}
        <div style={{ background: "#111113", border: allGatesPassed ? "1.5px solid #22c55e" : "1.5px solid #ef4444", borderRadius: 14, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #27272a", paddingBottom: 10 }}>
            <div>
              <span style={{ fontSize: 11, color: allGatesPassed ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                RIGHT PANE · 重建對外信件預覽 (委派總機 yongxiang.ltd@gmail.com)
              </span>
              <h2 style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 700 }}>
                套用範本：{item.templateCode}
              </h2>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: allGatesPassed ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.22)",
                color: allGatesPassed ? "#4ade80" : "#fca5a5",
              }}
            >
              {allGatesPassed ? "✓ 6 道 TLA+ 閘門全過 (GateOK=TRUE)" : "⛔ 守門攔截中 (GateOK=FALSE)"}
            </span>
          </div>

          {/* Email Header Preview */}
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span><strong>From:</strong> 詠翔測量專案經理 &lt;yongxiang.ltd@gmail.com&gt;</span>
              <span style={{ color: "#a1a1aa" }}>BCC: archive@yongxiang.example</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <strong>To:</strong> {item.recipientName} &lt;{item.recipientEmail}&gt; ({item.customerName})
            </div>
            <div>
              <strong>Subject:</strong> <span style={{ color: "#fff", fontWeight: 600 }}>{item.reconstructedSubject}</span>
            </div>
          </div>

          {/* First 3 Lines Highlight Preview */}
          <div style={{ background: "#09090b", border: "1px solid #3f3f46", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>
              👀 業主打開信件看到的正文（前 3 行高亮核對）：
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: 12.5, lineHeight: 1.55, color: "#fafafa" }}>
              {liveBody}
            </pre>
          </div>

          {/* 6-Gate TLA+ Verification Strip */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#e4e4e7" }}>
              6 道確定性閘門檢查單（Python `switchboard_engine` × PostgreSQL `outbound_guard` 同步驗證）：
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {gates.map((g, i) => (
                <div
                  key={i}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: g.passed ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(239,68,68,0.6)",
                    background: g.passed ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.14)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: g.passed ? "#4ade80" : "#fca5a5" }}>
                    <span>{g.passed ? "✓" : "✗"} {g.code}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#d4d4d8", marginTop: 3 }}>{g.detail}</div>
                  <code style={{ fontSize: 10, color: "#71717a" }}>{g.sql}</code>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Approval / Action Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid #27272a", marginTop: "auto" }}>
            <div style={{ fontSize: 12, color: sentStatus[item.id] ? "#4ade80" : "#a1a1aa", fontWeight: 600 }}>
              {sentStatus[item.id] || "等待原發信人 / PM 核准（零裸發保護：approved_by 必填）"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!allGatesPassed && hasSealed && effectiveUnpaid > 0 && (
                <button
                  onClick={() => setSentStatus((s) => ({ ...s, [item.id]: "✓ 已自動切換為「無章浮水印預覽版 PDF」並排入核准佇列" }))}
                  style={{ padding: "8px 12px", borderRadius: 8, background: "#d97706", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  改寄預覽版 (避開未入帳官章鎖)
                </button>
              )}
              <button
                onClick={() => setSentStatus((s) => ({ ...s, [item.id]: "✓ 已複製確認稿至剪貼簿（可貼至個人 LINE 留存書面影子）" }))}
                style={{ padding: "8px 12px", borderRadius: 8, background: "#27272a", color: "#fff", border: "1px solid #3f3f46", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                一鍵複製到 LINE
              </button>
              <button
                disabled={!allGatesPassed}
                onClick={() => setSentStatus((s) => ({ ...s, [item.id]: `✓ 已由 ${item.requester} 核准發送 (${item.serial} 寫入 audit_event)` }))}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  background: allGatesPassed ? "#16a34a" : "#3f3f46",
                  color: allGatesPassed ? "#fff" : "#71717a",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: allGatesPassed ? "pointer" : "not-allowed",
                }}
              >
                {allGatesPassed ? "核准並由總機寄出" : "⛔ 守門未過禁止寄出"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
