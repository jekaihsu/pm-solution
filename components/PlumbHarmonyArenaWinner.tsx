"use client";
import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  Mic,
  Send,
  ChevronRight,
  UserCheck,
  Briefcase,
  Compass,
  Calculator,
  Building2,
  CalendarCheck,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Copy,
  FileText,
} from "lucide-react";

export type OwnerRole = "mine" | "case" | "field" | "settlement" | "admin" | "attendance";
export type CanvasViewId = 1 | 2 | 3 | 4 | 5 | 6;

export interface EvidenceSqlMetric {
  label: string;
  value: string;
  sqlId: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}

export interface ProposedField {
  key: string;
  val: string;
}

export interface CardAction {
  id: string;
  label: string;
  transition: string;
  variant: "primary" | "secondary" | "danger";
  hotkey?: string;
}

export interface WinnerCard {
  id: string;
  role: OwnerRole;
  serial?: string;
  kind: "confirm" | "approve" | "choose" | "fix" | "inform";
  title: string; // <= 40 chars
  subtitle: string;
  assignee: string;
  slaText: string;
  evidenceMetrics: [EvidenceSqlMetric, EvidenceSqlMetric, EvidenceSqlMetric];
  proposedFields?: ProposedField[];
  canvasView: CanvasViewId;
  canvasTitle: string;
  actions: CardAction[];
  dualCard?: {
    cardALabel: string;
    cardADesc: string;
    cardBLabel: string;
    cardBDraft: string;
  };
  gateBadge?: string;
  rawCommandHeader?: string;
  reconstructedSubject?: string;
  reconstructedBody?: string;
  forbidsExternalLinks?: boolean;
  hasSealedAttachment?: boolean;
  unpaidAmountTwd?: number;
}

export const OWNER_ROLES: { id: OwnerRole; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "mine", label: "我的 (mine)", sub: "代寄·口述·OTP·證照", icon: <UserCheck size={16} /> },
  { id: "case", label: "案件 (case)", sub: "詢價·回傳·退件·指示單", icon: <Briefcase size={16} /> },
  { id: "field", label: "外業 (field)", sub: "台塑憑單·高鐵·颱風·回報", icon: <Compass size={16} /> },
  { id: "settlement", label: "結算 (settlement)", sub: "合庫沖帳·計價·下包·雙簽", icon: <Calculator size={16} /> },
  { id: "admin", label: "行政 (admin)", sub: "待分類·公文·勞保·聯絡人", icon: <Building2 size={16} /> },
  { id: "attendance", label: "出勤 (attendance)", sub: "09:30 點名 7 筆待確認", icon: <CalendarCheck size={16} /> },
];

export const PLAYBOOK_RULES_13 = [
  { code: "FPG_PERMIT_5WD", cat: "CAT-04", scope: "台塑集團", enf: "auto_card", text: "出入廠憑單限 5 工作天內；逾期未繳銷罰 NT$1,000＋切結書；D-1 提醒綁人綁車" },
  { code: "FPG_NO_EXTERNAL_LINKS", cat: "CAT-02", scope: "台塑/南亞/麥電", enf: "gate", text: "廠區禁外網：成果嚴禁附雲端連結 (https://)，>10MB 拆檔或寄光碟" },
  { code: "FPG_EPROCUREMENT_BILLING", cat: "CAT-06", scope: "台塑電子採購", enf: "advise", text: "請款前需進度達標通知；上傳 tradevan 採購網，不以 Email 寄發票" },
  { code: "NANYA_JSA_REVIEW", cat: "CAT-03", scope: "南亞塑膠", enf: "gate", text: "JSA 教育訓練日期必 ≥ 審查完成日且附彩色現場照片，否則退件" },
  { code: "THSRC_WORK_ORDER_BATCH", cat: "CAT-05", scope: "台灣高鐵", enf: "auto_card", text: "開口合約每張工作指示單 (PCDL-YY-NNNN)＝一個派工批次，未收單不得排工" },
  { code: "THSRC_3D_TRAVERSE_RECHECK", cat: "CAT-03", scope: "台灣高鐵", enf: "advise", text: "導線退件回覆必附 3D 導線共軛點複測成果、閉合差表與儀器校正證明" },
  { code: "THSRC_ACCEPTANCE_THEN_BILLING", cat: "CAT-06", scope: "台灣高鐵", enf: "gate", text: "驗收核決通知後才可正式發文計價並附計價憑證蓋大小章" },
  { code: "BES_INVOICE_RULES", cat: "CAT-06", scope: "中華工程", enf: "gate", text: "發票日期限每月 10～20 日；品名固定＝合約編號＋名稱＋第X期計價" },
  { code: "GOV_OFFICIAL_DOC_NUMBER", cat: "CAT-02", scope: "政府機關/港務", enf: "gate", text: "機關成果提送必帶正式發文字號「(民國年)詠發字第XXX號」" },
  { code: "GOV_BUILDING_LINE_DEADLINE", cat: "CAT-03", scope: "縣市政府", enf: "auto_card", text: "建築線補正法定期限 15～30 日，收件即建 document_due 承諾列追蹤" },
  { code: "HOLD_UNTIL_PAID_SEALED", cat: "CAT-02", scope: "全公司鐵律", enf: "gate", text: "官章版 (.dwg/.dxf) 在該里程碑發票未收 = 0 前禁止寄出；預覽版不受限" },
  { code: "BANK_NOTICE_NEVER_AUTO_UNLOCK", cat: "CAT-06", scope: "合庫/MUFG", enf: "gate", text: "銀行入帳通知只建 bank_notice 候選列（匯費容差±100），財務按卡才解鎖" },
  { code: "VERBAL_PROMISE_48H", cat: "CAT-01", scope: "全公司鐵律", enf: "auto_card", text: "電話/LINE 口頭承諾必於 48h 內發書面確認稿；未結承諾強制阻擋 C4/C12 結算" },
];

export const INITIAL_WINNER_CARDS: WinnerCard[] = [
  // MINE (我的)
  {
    id: "win-mine-1",
    role: "mine",
    serial: "業主往來 12086",
    kind: "approve",
    title: "代寄待核｜中鼎 卓育賢",
    subtitle: "攔截 yong.yx1101 衛星指令信 · 自動剝除首行「麻煩幫我寄給... #14行政」",
    assignee: "郭倢瑛 (報價管制)",
    slaText: "今日 17:30 前",
    gateBadge: "✓ 6 道守門全過 · 視圖 ① 對照",
    evidenceMetrics: [
      { label: "守門違規數", value: "0 / 6", sqlId: "sql:outbound_guard_precheck", tone: "good" },
      { label: "核定白名單附件", value: "2 檔", sqlId: "sql:outbound_attachment_fk", tone: "neutral" },
      { label: "套用範本", value: "quote_return v2", sqlId: "sql:email_template_v", tone: "neutral" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① 對外發信預覽與 6 項守門檢查單（業主往來 12086 中鼎）",
    rawCommandHeader: "寄件人：倢瑛(恆安) 麻煩幫我寄給中鼎卓育賢先生 #14行政 蕭小姐 報編115322 收到請登記",
    reconstructedSubject: "詠翔測量｜C115094-4 高雄港碼頭水深測量 報價回傳確認（報價編號 115322）",
    reconstructedBody:
      "卓育賢 先生您好：\n\n已收到貴單位回傳之報價簽認單（報價編號 115322），本案由專案經理 古恆安 負責，聯絡電話 07-331-XXXX。\n後續將由 古恆安 與您確認進場時間與所需資料。\n\n詠翔測量有限公司\n古恆安（專案經理）",
    forbidsExternalLinks: false,
    hasSealedAttachment: false,
    unpaidAmountTwd: 0,
    actions: [
      { id: "act-send", label: "1 確認發送 (yongxiang.ltd)", transition: "outbound:draft->approved->sent", variant: "primary", hotkey: "1" },
      { id: "act-modify", label: "2 修改草稿", transition: "outbound:open_editor", variant: "secondary", hotkey: "2" },
      { id: "act-cancel", label: "3 取消代寄", transition: "outbound:draft->cancelled", variant: "danger", hotkey: "3" },
    ],
  },
  {
    id: "win-mine-2",
    role: "mine",
    serial: "業主往來 12089",
    kind: "fix",
    title: "成果待寄（擋）｜C115094-4 台塑",
    subtitle: "⛔ 入帳後再寄出閘門攔截：含官章 .dwg 封印成果且待財務沖帳（差 30，匯費容差內）",
    assignee: "古恆安 (PM)",
    slaText: "待財務按卡沖帳即解鎖",
    gateBadge: "⛔ 官章成果鎖 (未收差額 NT$30)",
    evidenceMetrics: [
      { label: "待財務沖帳差額", value: "NT$ 30 (匯費內)", sqlId: "sql:invoice_paid_v", tone: "warn" },
      { label: "保留款未釋放", value: "NT$ 45,000", sqlId: "sql:invoice_retention_v", tone: "neutral" },
      { label: "副總特批有效", value: "否 (可改預覽版)", sqlId: "sql:deliverable_release_gate", tone: "bad" },
    ],
    canvasView: 3,
    canvasTitle: "視圖 ③ 成果放行與入帳沖銷單（C115094-4 台塑封印成果鎖）",
    rawCommandHeader: "請寄給台塑麥寮吳工程師 #12行政 業主往來12089 (入帳後再寄出)",
    reconstructedSubject: "詠翔測量｜(成果提供) C115094-4 麥寮廠區管線測量 成果提送",
    reconstructedBody:
      "吳工程師 您好：\n\n隨信提送 C115094-4 麥寮廠區管線測量成果檔案（詳附件清單）。\n請查收，謝謝。\n\n詠翔測量有限公司\n古恆安（專案經理）",
    forbidsExternalLinks: true,
    hasSealedAttachment: true,
    unpaidAmountTwd: 30,
    actions: [
      { id: "act-preview", label: "1 改寄預覽版 (浮水印無章)", transition: "attachment:swap_preview_pdf", variant: "primary", hotkey: "1" },
      { id: "act-override", label: "2 申請副總特批", transition: "release_gate:request_vp_override", variant: "secondary", hotkey: "2" },
      { id: "act-cancel", label: "3 取消", transition: "outbound:cancelled", variant: "secondary", hotkey: "3" },
    ],
  },
  {
    id: "win-mine-3",
    role: "mine",
    serial: "業主往來 12088",
    kind: "confirm",
    title: "承諾紀錄待確認｜黎明 張技師",
    subtitle: "電話 10 秒口述 → 內部承諾卡 A + 對外確認稿卡 B（48h 書面影子閉環）",
    assignee: "吳柏頤 (PM)",
    slaText: "距 48h 剩餘 46.2 小時",
    gateBadge: "🎙️ R31 Red-Team #6: proposed_fields 待確認",
    evidenceMetrics: [
      { label: "該案未結承諾數", value: "2 筆", sqlId: "sql:client_commitment_open_v", tone: "warn" },
      { label: "客戶承諾兌現率", value: "91%", sqlId: "sql:customer_behavior_v", tone: "good" },
      { label: "距 48h 剩餘", value: "46.2 h", sqlId: "sql:commitment_sla_clock_v", tone: "neutral" },
    ],
    proposedFields: [
      { key: "案件", val: "C115301" },
      { key: "類型", val: "追加 (scope_add)" },
      { key: "數量範圍", val: "北側加測 200 m" },
      { key: "期限", val: "10/31" },
    ],
    canvasView: 2,
    canvasTitle: "視圖 ② 報價／指示單／承諾比對表（C115301 黎明張技師）",
    dualCard: {
      cardALabel: "卡 A｜內部承諾列 (client_commitment.status=stated)",
      cardADesc: "確認後自動在 C115301 建立「預備合約明細（追加待簽）」並綁定結算閘門。",
      cardBLabel: "卡 B｜對外確認函待發 (含 2 工作日未回覆視為確認)",
      cardBDraft:
        "張技師您好，依剛才電話，C115301 北側約 200 m 加測一事，我們將於下週進場；請您於 10/31（五）前提供管線圖。如有不符請於 2 個工作日內回覆更正，逾期視為確認，謝謝。— 吳柏頤",
    },
    actions: [
      { id: "act-confirm", label: "1 正確 (寫入承諾＋發確認函)", transition: "commitment:stated->written_sent", variant: "primary", hotkey: "1" },
      { id: "act-copy-line", label: "2 複製到 LINE", transition: "outbound:copy_line_shadow", variant: "secondary", hotkey: "2" },
      { id: "act-not-comm", label: "3 不是承諾", transition: "commitment:withdrawn", variant: "danger", hotkey: "3" },
    ],
  },
  {
    id: "win-mine-4",
    role: "mine",
    kind: "inform",
    title: "e-GNSS 驗證碼就緒",
    subtitle: "CAT-10 本人拉取制 · 國土測繪中心 DKIM/SPF 驗證通過（永不進群組）",
    assignee: "古恆安 (請求者)",
    slaText: "剩餘 213 秒失效",
    gateBadge: "🔒 Inv_OTP_ZeroCross",
    evidenceMetrics: [
      { label: "剩餘有效秒數", value: "213 秒", sqlId: "sql:otp_request_ttl", tone: "warn" },
      { label: "認證帳號", value: "yx.ltd", sqlId: "sql:otp_forward_rule", tone: "good" },
      { label: "寄件驗證", value: "DKIM pass", sqlId: "sql:email_message_dkim", tone: "good" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① OTP 拉取白名單與零群組外洩防護",
    actions: [
      { id: "act-otp", label: "1 顯示一次（看完即失效：739204）", transition: "otp_request:deliver_once", variant: "primary", hotkey: "1" },
    ],
  },

  // CASE (案件)
  {
    id: "win-case-1",
    role: "case",
    serial: "業主往來 12085",
    kind: "choose",
    title: "新業主往來 12085｜中鼎",
    subtitle: "INTERNAL-FWD 總機轉寄登記 · 首行指名「給恆安，業主往來12085」",
    assignee: "古恆安",
    slaText: "待認領歸戶",
    evidenceMetrics: [
      { label: "單調流水號", value: "12085", sqlId: "sql:client_comm_serial", tone: "good" },
      { label: "關聯案件", value: "C115094-4", sqlId: "sql:email_link_case", tone: "neutral" },
      { label: "同串往來", value: "4 封", sqlId: "sql:email_thread_count", tone: "neutral" },
    ],
    canvasView: 2,
    canvasTitle: "視圖 ② 報價／指示單／承諾比對與往來時間軸（12085~12105）",
    actions: [
      { id: "act-c1", label: "1 認領", transition: "client_comm:claim_owner", variant: "primary", hotkey: "1" },
      { id: "act-c2", label: "2 轉給他人", transition: "client_comm:reassign", variant: "secondary", hotkey: "2" },
      { id: "act-c3", label: "3 不是我的", transition: "client_comm:quarantine", variant: "secondary", hotkey: "3" },
    ],
  },
  {
    id: "win-case-2",
    role: "case",
    serial: "業主往來 12092",
    kind: "fix",
    title: "退件｜高鐵 C114231 導線不符",
    subtitle: "CAT-03 審查意見退件 · 自動帶出高鐵 3D 導線共軛點複測 Playbook",
    assignee: "吳柏頤 (PM)",
    slaText: "停留 6 天 (標準 3)",
    gateBadge: "📘 視圖 ④ Playbook 對照",
    evidenceMetrics: [
      { label: "工序停留天數", value: "6 天 (標準3)", sqlId: "sql:case_task_aging_v", tone: "bad" },
      { label: "退件次數", value: "第 2 次", sqlId: "sql:task_event_rejects", tone: "warn" },
      { label: "上次通過版本", value: "2026-08-12", sqlId: "sql:client_playbook_rule", tone: "good" },
    ],
    canvasView: 4,
    canvasTitle: "視圖 ④ 審查退件與 13 條業主潛規則 Playbook 對照",
    actions: [
      { id: "act-ret1", label: "1 退回工序 (派執行組長)", transition: "case_task:status->returned", variant: "primary", hotkey: "1" },
      { id: "act-ret2", label: "2 擬回覆稿 (帶上次通過版)", transition: "outbound:draft_from_playbook", variant: "secondary", hotkey: "2" },
    ],
  },

  // FIELD (外業)
  {
    id: "win-field-1",
    role: "field",
    serial: "業主往來 12096",
    kind: "confirm",
    title: "憑單核准｜台塑 麥寮 D-1 繳銷",
    subtitle: "CAT-04 台塑出入廠憑單 · 5 工作天效期綁人綁車，逾期未繳銷罰 NT$1,000",
    assignee: "古恆安 / 吳科翰",
    slaText: "D-1 強制繳銷提醒",
    evidenceMetrics: [
      { label: "有效期限", value: "10/29 (5工作天)", sqlId: "sql:permit_workdays_v", tone: "warn" },
      { label: "綁定車號", value: "ABC-1234", sqlId: "sql:permit_vehicle_fk", tone: "neutral" },
      { label: "逾期罰款", value: "NT$ 1,000", sqlId: "sql:client_playbook_fpg", tone: "bad" },
    ],
    canvasView: 4,
    canvasTitle: "視圖 ④ 台塑憑單 5 工作天規則與外業派用檢查",
    actions: [
      { id: "act-f1", label: "1 已繳銷", transition: "permit:surrendered", variant: "primary", hotkey: "1" },
      { id: "act-f2", label: "2 申請延期 (稿)", transition: "outbound:draft_permit_ext", variant: "secondary", hotkey: "2" },
      { id: "act-f3", label: "3 改派人車", transition: "reservation:swap_asset", variant: "secondary", hotkey: "3" },
    ],
  },

  // SETTLEMENT (結算)
  {
    id: "win-settle-1",
    role: "settlement",
    serial: "業主往來 12098",
    kind: "approve",
    title: "入帳候選｜合庫 NT$849,970",
    subtitle: "CAT-06 銀行通知（永不自動解鎖）· 統編前後三碼命中＋差額 -30 匯費容差內",
    assignee: "財務 (佾均)",
    slaText: "確認後解鎖 C115094-4 官章成果",
    gateBadge: "🏦 視圖 ③ 入帳沖銷單",
    evidenceMetrics: [
      { label: "候選發票", value: "1 (INV-0187)", sqlId: "sql:bank_notice_match_v", tone: "good" },
      { label: "匯費差額", value: "-30 (容差±100)", sqlId: "sql:bank_fee_tolerance_v", tone: "good" },
      { label: "發票帳齡", value: "41 天", sqlId: "sql:invoice_aging_v", tone: "neutral" },
    ],
    canvasView: 3,
    canvasTitle: "視圖 ③ 成果放行與入帳沖銷單（合庫 NT$849,970 沖銷）",
    actions: [
      { id: "act-s1", label: "1 沖到 INV-2026-0187 (解鎖成果)", transition: "receipt_allocation:confirm", variant: "primary", hotkey: "1" },
      { id: "act-s2", label: "2 拆沖多張", transition: "receipt_allocation:split", variant: "secondary", hotkey: "2" },
      { id: "act-s3", label: "3 不是我們的", transition: "bank_notice:reject", variant: "danger", hotkey: "3" },
    ],
  },
  {
    id: "win-settle-2",
    role: "settlement",
    serial: "業主往來 12101",
    kind: "approve",
    title: "下包請款｜小柯 10月 NT$68,000",
    subtitle: "CAT-07 下包請款單 · 預估 60,000 vs 實際 68,000（毛利 28% → 25%）",
    assignee: "財務 / 鍾智偉",
    slaText: "視圖 ⑤ 毛利影響",
    evidenceMetrics: [
      { label: "預估 vs 實際", value: "60k vs 68k", sqlId: "sql:cost_item_est_v", tone: "warn" },
      { label: "超支比例", value: "+13%", sqlId: "sql:cost_item_variance_v", tone: "warn" },
      { label: "案件毛利變化", value: "28% → 25%", sqlId: "sql:case_month_pl_v", tone: "warn" },
    ],
    canvasView: 5,
    canvasTitle: "視圖 ⑤ 下包請款與毛利影響分析（小柯 10 月請款）",
    actions: [
      { id: "act-s4", label: "1 核准付款", transition: "cost_item:approve", variant: "primary", hotkey: "1" },
      { id: "act-s5", label: "2 退回補件 (稿)", transition: "outbound:return_sub", variant: "secondary", hotkey: "2" },
      { id: "act-s6", label: "3 標超支待 PM", transition: "cost_item:escalate_pm", variant: "secondary", hotkey: "3" },
    ],
  },
  {
    id: "win-settle-3",
    role: "settlement",
    kind: "approve",
    title: "結算待簽｜C115167-05（智偉已簽）",
    subtitle: "C12 JK 總經理簽核卡 · 電話追加承諾已全數結清 (Blocking(c)=false)",
    assignee: "JK (總經理)",
    slaText: "視圖 ⑥ 結算三方對帳",
    gateBadge: "✓ C4 鍾智偉已簽 · 未結承諾 0",
    evidenceMetrics: [
      { label: "結算毛利率", value: "31%", sqlId: "sql:case_settlement_pl_v", tone: "good" },
      { label: "未結口頭承諾", value: "0 筆", sqlId: "sql:settlement_commitment_v", tone: "good" },
      { label: "未收款項", value: "NT$ 0", sqlId: "sql:invoice_paid_v", tone: "good" },
    ],
    canvasView: 6,
    canvasTitle: "視圖 ⑥ 結算三方對帳與未結承諾檢查（C115167-05）",
    actions: [
      { id: "act-s7", label: "1 簽核 (gm_signed)", transition: "case_settlement:gm_signed", variant: "primary", hotkey: "1" },
      { id: "act-s8", label: "2 退回", transition: "case_settlement:return_vp", variant: "danger", hotkey: "2" },
    ],
  },

  // ADMIN (行政)
  {
    id: "win-admin-1",
    role: "admin",
    serial: "業主往來 12103",
    kind: "choose",
    title: "公文待收｜水利署 回覆期限 10/31",
    subtitle: "CAT-05 bizmail.docx.tw 公文（已刪除 Gmail 略過收件匣 filter）",
    assignee: "宣蓉 (總機)",
    slaText: "期限剩 6 天",
    evidenceMetrics: [
      { label: "期限剩餘", value: "6 天", sqlId: "sql:official_doc_due_v", tone: "warn" },
      { label: "來文文號", value: "水授四字11502", sqlId: "sql:official_doc_no", tone: "neutral" },
      { label: "關聯案件", value: "1 案 (C115208)", sqlId: "sql:case_gov_match_v", tone: "good" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① 公文收文與 (115)詠發字號守門檢查",
    actions: [
      { id: "act-a1", label: "1 登記並指派 PM", transition: "official_doc:register", variant: "primary", hotkey: "1" },
      { id: "act-a2", label: "2 歸檔", transition: "official_doc:archive", variant: "secondary", hotkey: "2" },
    ],
  },

  // ATTENDANCE (出勤)
  {
    id: "win-att-1",
    role: "attendance",
    kind: "confirm",
    title: "今日點名 7 筆待確認｜09:30",
    subtitle: "羅薇每日點名卡 · 未確認出勤 > 0 時發薪批次鎖定按鈕自動隱藏",
    assignee: "羅薇 (人事)",
    slaText: "09:45 前確認",
    evidenceMetrics: [
      { label: "待確認人數", value: "7 人", sqlId: "sql:attendance_unverified_v", tone: "warn" },
      { label: "今日預排出工", value: "38 人", sqlId: "sql:plan_daily_headcount_v", tone: "good" },
      { label: "缺卡/半天假", value: "2 筆", sqlId: "sql:attendance_anomaly_v", tone: "bad" },
    ],
    canvasView: 6,
    canvasTitle: "視圖 ⑥ 點名確認與發薪鎖定前置檢查",
    actions: [
      { id: "act-att1", label: "1 全部確認凍結", transition: "attendance_day:confirm_all", variant: "primary", hotkey: "1" },
      { id: "act-att2", label: "2 其餘照系統", transition: "attendance_day:accept_sys", variant: "secondary", hotkey: "2" },
    ],
  },
];

export default function PlumbHarmonyArenaWinner() {
  const [activeRole, setActiveRole] = useState<OwnerRole>("mine");
  const [cards, setCards] = useState<WinnerCard[]>(INITIAL_WINNER_CARDS);
  const [selectedCard, setSelectedCard] = useState<WinnerCard | null>(INITIAL_WINNER_CARDS[0]);
  const [forcedCanvasView, setForcedCanvasView] = useState<CanvasViewId | null>(null);
  const [simGateMutate, setSimGateMutate] = useState(false);
  const [simPaidCleared, setSimPaidCleared] = useState(false);
  const [voiceInput, setVoiceInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const roleCards = cards.filter((c) => c.role === activeRole);
  const countByRole = (r: OwnerRole) => cards.filter((c) => c.role === r).length;
  const activeView: CanvasViewId = forcedCanvasView ?? selectedCard?.canvasView ?? 1;

  const handleCardAction = (card: WinnerCard, act: CardAction) => {
    if (card.id === "win-settle-1" && act.id === "act-s1") {
      setSimPaidCleared(true);
    }
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    setToast(`✓ 拍板成功：${card.title} → ${act.transition}（寫入 PG audit_event）`);
    setTimeout(() => setToast(null), 4000);
  };

  const spawnVoiceCommitmentCard = (transcript: string, client: string, caseCode: string, scope: string) => {
    const newCard: WinnerCard = {
      id: `win-voice-${Date.now()}`,
      role: activeRole,
      serial: `業主往來 12106`,
      kind: "confirm",
      title: `承諾紀錄待確認｜${client}`,
      subtitle: `10秒口述：「${transcript}」`,
      assignee: "吳柏頤 (PM)",
      slaText: "48h 書面影子倒數 48:00",
      gateBadge: "🎙️ 雙卡生成 (內部承諾卡A + 確認稿卡B)",
      evidenceMetrics: [
        { label: "該案未結承諾", value: "3 筆", sqlId: "sql:client_commitment_open_v", tone: "warn" },
        { label: "客戶承諾兌現率", value: "94%", sqlId: "sql:customer_behavior_v", tone: "good" },
        { label: "距 48h 剩餘", value: "48.0 h", sqlId: "sql:commitment_sla_clock_v", tone: "good" },
      ],
      proposedFields: [
        { key: "案件", val: caseCode },
        { key: "類型", val: "scope_add (追加)" },
        { key: "數量範圍", val: scope },
        { key: "期限", val: "2026-11-05" },
      ],
      canvasView: 2,
      canvasTitle: `視圖 ② 口述承諾 vs 合約明細比對表（${caseCode} ${client}）`,
      dualCard: {
        cardALabel: "卡 A｜內部承諾列 (client_commitment.status=stated)",
        cardADesc: `確認後自動於 ${caseCode} 建立「預備合約明細（追加待簽）」，未結清前阻擋 C4/C12 結算。`,
        cardBLabel: "卡 B｜對外書面確認函 (含 2 工作日默認條款)",
        cardBDraft: `您好，依剛才電話討論，${caseCode} 案「${scope}」一事，我們已排入施測；如有不符請於 2 個工作日內回覆更正，逾期視為確認，謝謝。— 詠翔測量 吳柏頤`,
      },
      actions: [
        { id: "v-1", label: "1 正確 (建預備明細＋發確認函)", transition: "commitment:stated->written_sent", variant: "primary", hotkey: "1" },
        { id: "v-2", label: "2 一鍵複製到 LINE", transition: "outbound:copy_line_shadow", variant: "secondary", hotkey: "2" },
        { id: "v-3", label: "3 修改欄位", transition: "commitment:edit", variant: "secondary", hotkey: "3" },
      ],
    };
    setCards((prev) => [newCard, ...prev]);
    setSelectedCard(newCard);
    setForcedCanvasView(2);
    setVoiceInput("");
    setToast(`🎙️ 已從 10 秒語音口述動態生成「承諾卡 A + 對外確認稿卡 B」並開啟視圖 ② 比對！`);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 56px)", background: "#09090b", color: "#fafafa", fontFamily: "var(--font)" }}>
      {/* Top Arena Winner Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #27272a", background: "linear-gradient(90deg, #0f172a 0%, #111113 100%)", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: 12, padding: "3px 9px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Sparkles size={13} /> Arena Winner (Candidate C · A+B 終極嫁接版)
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Plumb 極簡拍板收件匣 × AI 業主往來總機（R27 減法 · R28 書記官 · R29/R30/R31 六視圖守門）
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ background: "#18181b", border: "1px solid #27272a", padding: "3px 8px", borderRadius: 6, color: "#93c5fd" }}>
            業主往來單調序號：#12085 ~ #12105
          </span>
          <span style={{ background: "rgba(34,197,94,0.14)", color: "#4ade80", padding: "3px 8px", borderRadius: 6, fontWeight: 600 }}>
            ● R30 pytest 23/23 PASS · actual_sends=0
          </span>
        </div>
      </div>

      {toast && (
        <div data-testid="winner-toast" style={{ background: "#14532d", color: "#f0fdf4", padding: "8px 20px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #22c55e", display: "flex", justifyContent: "space-between" }}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "#86efac", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* 3-Column Core Architecture: Left 6 Owner Agents | Center Card Stream + 10s ChatBar | Right 6-View Canvas */}
      <div style={{ display: "grid", gridTemplateColumns: "225px minmax(0, 1fr) 480px", flex: 1, overflow: "hidden" }}>
        
        {/* LEFT RAIL: Exact 6 R31 Owner Agent Roles */}
        <aside style={{ borderRight: "1px solid #27272a", background: "#111113", padding: "14px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 8px 8px" }}>
              6 Owner Agents (`GET /inbox?role=`)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {OWNER_ROLES.map((r) => {
                const count = countByRole(r.id);
                const active = activeRole === r.id;
                return (
                  <button
                    key={r.id}
                    data-testid={`role-tab-${r.id}`}
                    onClick={() => {
                      setActiveRole(r.id);
                      const first = cards.find((c) => c.role === r.id);
                      if (first) {
                        setSelectedCard(first);
                        setForcedCanvasView(null);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: active ? "1px solid #22c55e" : "1px solid transparent",
                      background: active ? "rgba(34, 197, 94, 0.14)" : "transparent",
                      color: active ? "#ffffff" : "#d4d4d8",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: active ? "#4ade80" : "#a1a1aa" }}>{r.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                        <div style={{ fontSize: 11, color: "#71717a" }}>{r.sub}</div>
                      </div>
                    </div>
                    <span
                      style={{
                        minWidth: 22,
                        height: 22,
                        borderRadius: 999,
                        background: count > 0 ? "#dc2626" : "#27272a",
                        color: count > 0 ? "#fff" : "#71717a",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 6px",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 48h Verbal Commitment Radar Widget */}
          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 10, fontSize: 11 }}>
            <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>⏱️ 48h 口頭承諾書面影子雷達</div>
            <div style={{ color: "#d4d4d8", lineHeight: 1.45 }}>
              • C115301 黎明北側200m：<span style={{ color: "#fbbf24" }}>待發確認函 (46h)</span><br />
              • C115167-05 水深追加3次：<span style={{ color: "#4ade80" }}>已簽回 (可結算)</span>
            </div>
          </div>
        </aside>

        {/* CENTER STREAM: Decision Cards + Bottom 10s Voice Bar */}
        <section style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", overflowY: "auto", padding: "16px 20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  今日待你拍板（{roleCards.length} 張卡）
                </h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#a1a1aa" }}>
                  一打開就知道要幹嘛 · 標題 ≤40 字 · 3 個 SQL 證據數 · 按 1/2/3 秒速決策
                </p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  data-testid="quick-open-gate-sim"
                  onClick={() => {
                    const satCard = cards.find((c) => c.id === "win-mine-1") || INITIAL_WINNER_CARDS[0];
                    setSelectedCard(satCard);
                    setForcedCanvasView(1);
                    setSimGateMutate((v) => !v);
                  }}
                  style={{
                    fontSize: 11,
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: simGateMutate ? "1px solid #ef4444" : "1px solid #3f3f46",
                    background: simGateMutate ? "rgba(239,68,68,0.2)" : "#18181b",
                    color: simGateMutate ? "#fca5a5" : "#d4d4d8",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {simGateMutate ? "💥 突變攔截中：首行/外網違規" : "🛡️ 測試衛星首行＆台塑外網攔截"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {roleCards.map((card) => {
                const isSelected = selectedCard?.id === card.id;
                return (
                  <div
                    key={card.id}
                    data-testid={`card-${card.id}`}
                    onClick={() => {
                      setSelectedCard(card);
                      setForcedCanvasView(null);
                    }}
                    style={{
                      border: isSelected ? "1.5px solid #22c55e" : "1px solid #27272a",
                      borderRadius: 12,
                      background: "#131316",
                      padding: 15,
                      cursor: "pointer",
                      boxShadow: isSelected ? "0 0 0 3px rgba(34,197,94,0.14)" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {card.serial && (
                          <span style={{ fontSize: 11, fontFamily: "var(--mono)", background: "#1e293b", color: "#93c5fd", padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>
                            {card.serial}
                          </span>
                        )}
                        <span style={{ fontSize: 11, background: "#27272a", color: "#e4e4e7", padding: "2px 7px", borderRadius: 5 }}>
                          {card.assignee}
                        </span>
                        {card.gateBadge && (
                          <span style={{ fontSize: 11, background: card.gateBadge.startsWith("⛔") ? "rgba(220,38,38,0.2)" : "rgba(34,197,94,0.16)", color: card.gateBadge.startsWith("⛔") ? "#fca5a5" : "#86efac", padding: "2px 7px", borderRadius: 5, fontWeight: 600 }}>
                            {card.gateBadge}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} /> {card.slaText}
                      </span>
                    </div>

                    <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff", marginBottom: 3 }}>{card.title}</div>
                    <div style={{ fontSize: 12.5, color: "#a1a1aa", marginBottom: 10 }}>{card.subtitle}</div>

                    {/* 3 SQL-backed Evidence Numbers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 10 }}>
                      {card.evidenceMetrics.map((m, idx) => (
                        <div key={idx} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "7px 9px" }}>
                          <div style={{ fontSize: 10.5, color: "#a1a1aa", display: "flex", justifyContent: "space-between" }}>
                            <span>{m.label}</span>
                            <code style={{ fontSize: 9.5, color: "#60a5fa" }}>{m.sqlId}</code>
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              marginTop: 2,
                              color: m.tone === "good" ? "#4ade80" : m.tone === "warn" ? "#fbbf24" : m.tone === "bad" ? "#f87171" : "#fafafa",
                            }}
                          >
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Proposed fields badge for confirm cards */}
                    {card.proposedFields && (
                      <div style={{ background: "rgba(245, 158, 11, 0.09)", border: "1px solid rgba(245, 158, 11, 0.35)", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 4 }}>
                          待確認 (Agent 抽取 `proposed_fields` · 確認後才寫入 `client_commitment`)：
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11.5 }}>
                          {card.proposedFields.map((pf, i) => (
                            <span key={i} style={{ background: "#18181b", padding: "2px 7px", borderRadius: 5, border: "1px solid #3f3f46" }}>
                              <strong style={{ color: "#a1a1aa" }}>{pf.key}：</strong>
                              <span style={{ color: "#fff", fontWeight: 600 }}>{pf.val}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dual Card A + Card B */}
                    {card.dualCard && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 8, marginBottom: 10 }}>
                        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 9 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 3 }}>{card.dualCard.cardALabel}</div>
                          <div style={{ fontSize: 11.5, color: "#d4d4d8", lineHeight: 1.4 }}>{card.dualCard.cardADesc}</div>
                        </div>
                        <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 9 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", marginBottom: 3 }}>{card.dualCard.cardBLabel}</div>
                          <div style={{ fontSize: 11.5, color: "#e4e4e7", lineHeight: 1.4, fontFamily: "var(--mono)" }}>{card.dualCard.cardBDraft}</div>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 6, borderTop: "1px solid #27272a" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {card.actions.map((act) => (
                          <button
                            key={act.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCardAction(card, act);
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 7,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              border: act.variant === "primary" ? "none" : "1px solid #3f3f46",
                              background: act.variant === "primary" ? "#16a34a" : act.variant === "danger" ? "rgba(220,38,38,0.16)" : "#18181b",
                              color: act.variant === "danger" ? "#fca5a5" : "#fff",
                            }}
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                      <span style={{ fontSize: 11.5, color: "#4ade80", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                        右側視圖 #{card.canvasView} <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* BOTTOM CHATBAR: 10-Second Voice Memo Generator */}
          <div style={{ marginTop: 16, borderTop: "1px solid #27272a", paddingTop: 12, background: "#09090b" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Mic size={14} /> 掛電話對 Agent 講 10 秒（一鍵實測「口頭承諾 → 卡A 內部承諾列 + 卡B 對外確認稿」）：
              </span>
              <span style={{ fontSize: 11, color: "#71717a" }}>R28 護城河：沒有一句口頭承諾沒有書面影子</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button
                data-testid="voice-preset-btn-1"
                onClick={() =>
                  spawnVoiceCommitmentCard(
                    "剛才中興王經理電話，C115211-1 要求北側加測 3 點控制點，下週三前交成果圖",
                    "中興工程 王經理",
                    "C115211-1",
                    "北側加測 3 點控制點 (11/5 交圖)"
                  )
                }
                style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 999, background: "#14532d", border: "1px solid #22c55e", color: "#dcfce7", cursor: "pointer", fontWeight: 600 }}
              >
                🎙️ 點擊實測 10 秒口述：「中興王經理電話要求 C115211-1 加測 3 點控制點…」
              </button>
              <button
                data-testid="voice-preset-btn-2"
                onClick={() =>
                  spawnVoiceCommitmentCard(
                    "剛才黎明張技師電話，C115301 北側 200 公尺加測確認追加預算 4.5 萬",
                    "黎明顧問 張技師",
                    "C115301",
                    "北側 200m 加測追加 NT$45,000"
                  )
                }
                style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 999, background: "#1e293b", border: "1px solid #3b82f6", color: "#bfdbfe", cursor: "pointer" }}
              >
                🎙️ 實測口述 2：「黎明張技師確認北側 200m 追加 4.5 萬…」
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                placeholder="對 Agent 講 10 秒或輸入指令（如：把 C115301 報價寄給中興王經理）..."
                style={{ flex: 1, background: "#18181b", border: "1px solid #3f3f46", color: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12.5 }}
              />
              <button
                onClick={() => {
                  if (!voiceInput.trim()) return;
                  spawnVoiceCommitmentCard(voiceInput, "指定業主窗口", "C115301", voiceInput);
                }}
                style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}
              >
                生成雙卡
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT DRAWER CANVAS: All 6 R31 Views (View ①..⑥) */}
        <aside style={{ borderLeft: "1px solid #27272a", background: "#111113", padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>
                R31 單一預篩視圖 (`GET /canvas/{selectedCard?.id || "card"}`)
              </span>
              <span style={{ fontSize: 10.5, color: "#a1a1aa", fontFamily: "var(--mono)" }}>[MASKED_HR_PRIVATE]</span>
            </div>

            {/* 6 View Switcher Pills for instant inspection of all 6 R31 Canvas Contracts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4, marginBottom: 10 }}>
              {([1, 2, 3, 4, 5, 6] as CanvasViewId[]).map((v) => (
                <button
                  key={v}
                  data-testid={`canvas-view-btn-${v}`}
                  onClick={() => setForcedCanvasView(v)}
                  style={{
                    padding: "5px 4px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    border: activeView === v ? "1px solid #22c55e" : "1px solid #27272a",
                    background: activeView === v ? "rgba(34,197,94,0.2)" : "#18181b",
                    color: activeView === v ? "#4ade80" : "#a1a1aa",
                  }}
                >
                  視圖 #{v}
                </button>
              ))}
            </div>

            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "#fff" }}>
              {activeView === 1 && "視圖 ① 對外發信預覽與 6 項守門檢查單"}
              {activeView === 2 && "視圖 ② 報價／指示單／承諾比對表＋往來時間軸"}
              {activeView === 3 && "視圖 ③ 成果放行與入帳沖銷單（匯費容差±100）"}
              {activeView === 4 && "視圖 ④ 審查退件與 13 條業主潛規則 Playbook"}
              {activeView === 5 && "視圖 ⑤ 下包請款與案件毛利影響分析"}
              {activeView === 6 && "視圖 ⑥ 結算三方對帳與未結承諾阻擋閘"}
            </h3>
          </div>

          {/* SQL Provenance Header */}
          {selectedCard && (
            <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 9, fontSize: 11 }}>
              <div style={{ color: "#a1a1aa", fontWeight: 600, marginBottom: 4 }}>本卡數字來源 (`evidence_sql_ids` 100% 硬表驗證)：</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {selectedCard.evidenceMetrics.map((m, i) => (
                  <code key={i} style={{ background: "#09090b", color: "#4ade80", padding: "2px 6px", borderRadius: 4, fontSize: 10.5 }}>
                    {m.sqlId}: {m.value}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 1: Outbound Preview + Stripped Command Diff + 6 Gates */}
          {activeView === 1 && (
            <div data-testid="canvas-view-1" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.4)", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>
                  ✂️ 衛星指令信原件（已由 `parse_satellite_command` 剝除首行）：
                </div>
                <div style={{ fontSize: 11.5, fontFamily: "var(--mono)", color: "#fecaca", textDecoration: "line-through" }}>
                  {selectedCard?.rawCommandHeader || "寄件人：倢瑛(恆安) 麻煩幫我寄給中鼎卓育賢先生 #14行政 蕭小姐 報編115322"}
                </div>
              </div>

              <div style={{ background: "#09090b", border: "1px solid #3f3f46", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>
                  👀 業主會看到的最終信（前 3 行高亮 · 委派 `yongxiang.ltd`）：
                </div>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--mono)", fontSize: 11.5, color: "#fafafa", lineHeight: 1.5 }}>
                  {simGateMutate
                    ? `麻煩幫我寄給中鼎卓育賢 #14行政 (內部底價毛利31%)\n雲端連結：https://drive.google.com/xx\n` + (selectedCard?.reconstructedBody || "")
                    : selectedCard?.reconstructedBody ||
                      "卓育賢 先生您好：\n已收到貴單位回傳之報價簽認單（報價編號 115322），本案由專案經理 古恆安 負責。\n後續將由 古恆安 與您確認進場時間與所需資料。"}
                </pre>
              </div>

              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                  6 項確定性守門檢查單 (`outbound_guard()` + `switchboard_engine.py`)：
                </div>
                {[
                  { name: "1. 內部指令字串鎖 (INTERNAL_PATTERNS)", ok: !simGateMutate },
                  { name: "2. 敏感禁詞鎖 (無 成本/毛利/底價/點數單價)", ok: !simGateMutate },
                  { name: "3. 收件人屬該案件客戶白名單 (contact FK)", ok: true },
                  { name: "4. 業主投遞限制鎖 (台塑禁外網 https://)", ok: !simGateMutate },
                  { name: "5. 附件 SHA256 核定版白名單 (deliverable FK)", ok: true },
                  { name: "6. 官章成果入帳閘 (sealed_release_allowed)", ok: !(selectedCard?.hasSealedAttachment && !simPaidCleared) },
                ].map((g, i) => (
                  <div key={i} style={{ fontSize: 11.5, padding: "3px 0", color: g.ok ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                    {g.ok ? "✓ PASS" : "✗ BLOCK"} · {g.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 2: Quote / Work Order / Commitment Diff + Timeline 12085~12105 */}
          {activeView === 2 && (
            <div data-testid="canvas-view-2" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#93c5fd", marginBottom: 6 }}>
                  左右兩欄比對（口述承諾 vs 合約明細 / 指示單 vs 母約額度）：
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #27272a", color: "#a1a1aa", textAlign: "left" }}>
                      <th style={{ padding: 4 }}>項目</th>
                      <th style={{ padding: 4 }}>原合約 / 母約</th>
                      <th style={{ padding: 4 }}>本卡承諾 / 異動高亮</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #27272a" }}>
                      <td style={{ padding: 4 }}>C115301 範圍</td>
                      <td style={{ padding: 4 }}>南側主幹管 800m</td>
                      <td style={{ padding: 4, color: "#fbbf24", fontWeight: 700 }}>+ 北側加測 200m (建預備明細)</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #27272a" }}>
                      <td style={{ padding: 4 }}>管線圖提供日</td>
                      <td style={{ padding: 4 }}>未定</td>
                      <td style={{ padding: 4, color: "#4ade80", fontWeight: 700 }}>業主承諾 2026-10-31 前給圖</td>
                    </tr>
                    <tr>
                      <td style={{ padding: 4 }}>PCDL-25-0376</td>
                      <td style={{ padding: 4 }}>母約剩餘 2.10M</td>
                      <td style={{ padding: 4, color: "#93c5fd" }}>第12張指示單 180k (水位 71%)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                  《業主往來紀錄表》時間軸 (`case_timeline_v` · 12085~12105 實況)：
                </div>
                {[
                  { s: "業主往來 12085", c: "CAT-01", t: "中鼎高雄港碼頭詢價與規範 · 恆安認領", st: "已歸戶" },
                  { s: "業主往來 12086", c: "INTERNAL-CMD", t: "【業主回傳】報編115322 簽認單 · 剝除首行待發", st: "待核准" },
                  { s: "業主往來 12088", c: "PHONE-10S", t: "黎明張技師口頭交辦北側加測 200m · 48h 追蹤", st: "stated" },
                  { s: "業主往來 12089", c: "CAT-02", t: "台塑 C115094-4 官章 DWG 成果提送", st: "⛔入帳鎖" },
                ].map((r, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "5px 0", borderBottom: "1px solid #27272a", display: "flex", justifyContent: "space-between" }}>
                    <span><strong style={{ color: "#60a5fa" }}>{r.s}</strong> [{r.c}] {r.t}</span>
                    <span style={{ color: "#fbbf24" }}>{r.st}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 3: Deliverable Release Gate & Bank Notice Allocation */}
          {activeView === 3 && (
            <div data-testid="canvas-view-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>
                  視圖 ③ 發票 → 銀行入帳候選 → 匯費容差 → 封印成果放行鏈：
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div>• <strong>目標發票：</strong>INV-2026-0187（應收總額 NT$850,000）</div>
                  <div>• <strong>合庫入帳通知 (`bank_notice`)：</strong>NT$849,970（遮罩統編 `541**047` 前後三碼命中）</div>
                  <div>• <strong>差異分析：</strong>差額 <span style={{ color: "#4ade80", fontWeight: 700 }}>-NT$30</span>（屬於 `BANK_FEE_TOLERANCE_TWD = 100` 匯費容差內）</div>
                  <div>
                    • <strong>封印成果放行狀態 (`sealed_release_allowed`)：</strong>{" "}
                    {simPaidCleared ? (
                      <span style={{ color: "#4ade80", fontWeight: 700 }}>✓ 財務已確認沖帳 (unpaid=0)，官章 .dwg 已解鎖可寄出！</span>
                    ) : (
                      <span style={{ color: "#f87171", fontWeight: 700 }}>⛔ 財務尚未按卡沖帳 (unpaid=30)，官章 .dwg 強制鎖定中</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 4: Review Rejection & 13 Client Playbook Rules */}
          {activeView === 4 && (
            <div data-testid="canvas-view-4" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#93c5fd" }}>
                R30 種子庫：13 條業主潛規則 (`006_seed_client_playbook_and_templates.sql`)：
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }}>
                {PLAYBOOK_RULES_13.map((r, i) => (
                  <div key={i} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: 8, fontSize: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#60a5fa" }}>
                      <span>{r.code} ({r.scope})</span>
                      <span style={{ color: r.enf === "gate" ? "#f87171" : "#4ade80" }}>[{r.enf}] · {r.cat}</span>
                    </div>
                    <div style={{ color: "#d4d4d8", marginTop: 2 }}>{r.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW 5: Subcontractor Billing & Margin Impact */}
          {activeView === 5 && (
            <div data-testid="canvas-view-5" style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>視圖 ⑤ 下包請款與案件毛利影響（人員薪資已由 RLS 遮罩）：</div>
              <div>• 供應商：柯博松測量團隊（10 月份外包請款）</div>
              <div>• 預估成本：NT$ 60,000 ｜ 實際請款：NT$ 68,000（超支 +13.3%）</div>
              <div>• 案件毛利率影響：由 <strong>28.4%</strong> 降至 <strong>25.1%</strong>（未逾 20% 強制擋付門檻，可由財務核准）</div>
            </div>
          )}

          {/* VIEW 6: Settlement 3-Way Reconciliation & Unresolved Commitment Gate */}
          {activeView === 6 && (
            <div data-testid="canvas-view-6" style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: "#4ade80", marginBottom: 8 }}>
                視圖 ⑥ 結算三方對帳與 `settlement_gate()` 未結承諾檢查（C115167-05）：
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div>• <strong>合約總額：</strong>NT$ 610,000 ｜ <strong>已計價：</strong>NT$ 610,000 ｜ <strong>已入帳：</strong>NT$ 610,000</div>
                <div>• <strong>總成本（人力點數折算＋外部成本）：</strong>NT$ 420,000（毛利率 31.1%）</div>
                <div>• <strong>口頭承諾盤點 (`settlement_commitment_v`)：</strong>電話追加 3 次（均已具書面影子並轉正式明細，未結承諾 = 0）</div>
                <div>• <strong>簽核鏈狀態：</strong>C4 副總鍾智偉已簽 (`vp_signed`) → 等待 C12 總經理 JK 簽核 (`gm_signed`)</div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
