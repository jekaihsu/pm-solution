"use client";
import React, { useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Mic,
  Send,
  Copy,
  FileText,
  Clock,
  Sparkles,
  ChevronRight,
  X,
  Database,
  Lock,
  UserCheck,
  Briefcase,
  Compass,
  Calculator,
  Building2,
  CalendarCheck,
  Check,
  Volume2,
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
}

export interface HarmonyCard {
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
}

export const OWNER_ROLES: { id: OwnerRole; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "mine", label: "我的 (mine)", sub: "代寄·口述·OTP", icon: <UserCheck size={16} /> },
  { id: "case", label: "案件 (case)", sub: "報價·交接·退件", icon: <Briefcase size={16} /> },
  { id: "field", label: "外業 (field)", sub: "憑單·核准·回報", icon: <Compass size={16} /> },
  { id: "settlement", label: "結算 (settlement)", sub: "沖帳·計價·雙簽", icon: <Calculator size={16} /> },
  { id: "admin", label: "行政 (admin)", sub: "總機·公文·勞保", icon: <Building2 size={16} /> },
  { id: "attendance", label: "出勤 (attendance)", sub: "09:30 點名確認", icon: <CalendarCheck size={16} /> },
];

export const INITIAL_CARDS: HarmonyCard[] = [
  // MINE (我的)
  {
    id: "card-mine-1",
    role: "mine",
    serial: "業主往來 12088",
    kind: "confirm",
    title: "承諾紀錄待確認｜黎明 張技師",
    subtitle: "電話 10 秒口述（Lark 語音 DM）→ 內部承諾卡 A + 對外確認稿卡 B",
    assignee: "吳柏頤 (PM)",
    slaText: "48h 書面影子倒數 46:12",
    evidenceMetrics: [
      { label: "該案未結承諾數", value: "2 筆", sqlId: "sql:client_commitment_open_v", tone: "warn" },
      { label: "客戶承諾兌現率", value: "91%", sqlId: "sql:customer_behavior_v", tone: "good" },
      { label: "距 48h 剩餘", value: "46.2 h", sqlId: "sql:commitment_sla_clock_v", tone: "neutral" },
    ],
    proposedFields: [
      { key: "案件", val: "C115301" },
      { key: "類型", val: "scope_add (追加)" },
      { key: "範圍數量", val: "北側加測 200 m" },
      { key: "期限", val: "2026-10-31" },
    ],
    canvasView: 2,
    canvasTitle: "視圖 ② 報價／指示單／承諾比對表（C115301 黎明工程）",
    dualCard: {
      cardALabel: "卡 A｜內部承諾列 (client_commitment.status=stated)",
      cardADesc: "確認後自動在 C115301 建立「預備合約明細（追加待簽）」並綁定結算前檢查。",
      cardBLabel: "卡 B｜對外確認稿 (outbound_message · 含 2 工作日默認條款)",
      cardBDraft:
        "張技師您好，依剛才電話討論，C115301 北側約 200 m 加測一事，我們將於下週進場施測；請您於 10/31（五）前提供管線圖。如有不符請於 2 個工作日內回覆更正，謝謝。— 詠翔測量 吳柏頤",
    },
    actions: [
      { id: "act-confirm-send", label: "確認抽取＋發送 Email", transition: "commitment:stated->written_sent", variant: "primary" },
      { id: "act-copy-line", label: "一鍵複製到 LINE", transition: "outbound:copy_line_shadow", variant: "secondary" },
      { id: "act-edit", label: "修改抽取欄位", transition: "commitment:edit_proposed", variant: "secondary" },
    ],
  },
  {
    id: "card-mine-2",
    role: "mine",
    serial: "業主往來 12086",
    kind: "approve",
    title: "代寄待核｜中鼎 卓育賢",
    subtitle: "攔截 yong.yx1101 衛星指令信 · 已自動剝除首行「麻煩幫我寄給... #14行政」",
    assignee: "郭倢瑛 (報價管制)",
    slaText: "今日 17:30 前",
    gateBadge: "✓ 6 道守門全過 (quote_return_reply v2)",
    evidenceMetrics: [
      { label: "守門違規數", value: "0 / 6", sqlId: "sql:outbound_guard_precheck", tone: "good" },
      { label: "核定白名單附件", value: "2 檔", sqlId: "sql:outbound_attachment_fk", tone: "neutral" },
      { label: "套用範本", value: "quote_return v2", sqlId: "sql:email_template_v", tone: "neutral" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① 對外發信預覽與 6 項守門檢查單（業主往來 12086）",
    actions: [
      { id: "act-send", label: "確認發送 (yongxiang.ltd)", transition: "outbound:draft->approved->sent", variant: "primary" },
      { id: "act-modify", label: "修改草稿", transition: "outbound:open_editor", variant: "secondary" },
      { id: "act-cancel", label: "取消代寄", transition: "outbound:draft->cancelled", variant: "danger" },
    ],
  },
  {
    id: "card-mine-3",
    role: "mine",
    serial: "業主往來 12089",
    kind: "fix",
    title: "成果待寄（擋）｜C115094-4 台塑",
    subtitle: "⛔ 入帳後再寄出閘門觸發：含官章 .dwg 封印成果且待財務沖帳（差 30 匯費容差內）",
    assignee: "古恆安 (外業組長/PM)",
    slaText: "入帳閘攔截中",
    gateBadge: "⛔ 官章成果鎖 (HOLD_UNTIL_PAID_SEALED)",
    evidenceMetrics: [
      { label: "待沖帳差額", value: "NT$ 30", sqlId: "sql:invoice_paid_v", tone: "warn" },
      { label: "保留款未釋放", value: "NT$ 45,000", sqlId: "sql:invoice_retention_v", tone: "neutral" },
      { label: "副總特批有效", value: "否 (需申請)", sqlId: "sql:deliverable_release_gate", tone: "bad" },
    ],
    canvasView: 3,
    canvasTitle: "視圖 ③ 成果放行與入帳沖銷單（C115094-4 台塑麥寮）",
    actions: [
      { id: "act-preview", label: "改寄預覽版 (浮水印無章)", transition: "attachment:swap_preview_pdf", variant: "primary" },
      { id: "act-override", label: "申請副總特批放行", transition: "release_gate:request_vp_override", variant: "secondary" },
      { id: "act-cancel", label: "暫緩寄出", transition: "outbound:hold_in_queue", variant: "secondary" },
    ],
  },
  {
    id: "card-mine-4",
    role: "mine",
    kind: "inform",
    title: "e-GNSS 驗證碼就緒｜國土測繪中心",
    subtitle: "CAT-10 拉取制白名單命中 · 僅顯示給請求者本人，絕不推播至大群",
    assignee: "古恆安 (請求者本人)",
    slaText: "TTL 剩餘 213 秒",
    gateBadge: "🔒 Inv_OTP_ZeroCross (DKIM+SPF Pass)",
    evidenceMetrics: [
      { label: "有效剩餘秒數", value: "213 秒", sqlId: "sql:otp_request_ttl", tone: "warn" },
      { label: "認證帳號", value: "yx.ltd", sqlId: "sql:otp_forward_rule", tone: "good" },
      { label: "群組外洩數", value: "0 (拉取鎖)", sqlId: "sql:otp_audit_zero_group", tone: "good" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① OTP 白名單與 DKIM 安全驗證紀錄",
    actions: [
      { id: "act-otp-once", label: "顯示一次驗證碼 (739204)", transition: "otp_request:deliver_once_burn", variant: "primary" },
    ],
  },

  // CASE (案件)
  {
    id: "card-case-1",
    role: "case",
    serial: "業主往來 12085",
    kind: "choose",
    title: "新業主往來 12085｜中鼎工程",
    subtitle: "INTERNAL-FWD 總機轉寄登記 · 首行指名「給恆安，業主往來12085」已縫合",
    assignee: "古恆安 / 吳柏頤",
    slaText: "今日待認領",
    evidenceMetrics: [
      { label: "單調流水號", value: "#12085", sqlId: "sql:client_comm_serial", tone: "good" },
      { label: "關聯案件", value: "C115094-4", sqlId: "sql:email_link_case", tone: "neutral" },
      { label: "同串歷史往來", value: "4 封", sqlId: "sql:email_thread_count", tone: "neutral" },
    ],
    canvasView: 2,
    canvasTitle: "視圖 ② 業主往來時間軸與承諾比對（業主往來 12085~12105）",
    actions: [
      { id: "act-claim", label: "認領本案往來", transition: "client_comm:assign_owner", variant: "primary" },
      { id: "act-reassign", label: "轉給其他 PM", transition: "client_comm:transfer_pm", variant: "secondary" },
      { id: "act-not-mine", label: "不是我的 (退總機)", transition: "client_comm:quarantine_admin", variant: "secondary" },
    ],
  },
  {
    id: "card-case-2",
    role: "case",
    serial: "業主往來 12092",
    kind: "fix",
    title: "退件｜高鐵 C114231 導線不符",
    subtitle: "CAT-03 審查意見退件 · 命中 Playbook THSRC_3D_TRAVERSE_RECHECK",
    assignee: "吳柏頤 (PM)",
    slaText: "報告關已停留 6 天 (標準 3)",
    gateBadge: "📘 Playbook: 需附 3D 導線共軛點複測＋閉合差表",
    evidenceMetrics: [
      { label: "工序停留天數", value: "6 天 (超3)", sqlId: "sql:case_task_aging_v", tone: "bad" },
      { label: "本案退件次數", value: "第 2 次", sqlId: "sql:task_event_rejects", tone: "warn" },
      { label: "上次通過範本", value: "2026-08-12", sqlId: "sql:client_playbook_rule", tone: "good" },
    ],
    canvasView: 4,
    canvasTitle: "視圖 ④ 審查退件與 Playbook 對照（高鐵 C114231 導線複測）",
    actions: [
      { id: "act-return-task", label: "退回工序 (派執行組長)", transition: "case_task:status->returned", variant: "primary" },
      { id: "act-draft-reply", label: "擬回覆稿 (帶上次通過版)", transition: "outbound:draft_from_playbook", variant: "secondary" },
    ],
  },
  {
    id: "card-case-3",
    role: "case",
    serial: "業主往來 12095",
    kind: "approve",
    title: "工作指示單｜PCDL-25-0376 第12張",
    subtitle: "CAT-05 高鐵開口合約指示單 · 自動掛母案 rate_card 建立子案 -12",
    assignee: "鍾智偉 (母案 PM)",
    slaText: "未建批次前不得排工",
    evidenceMetrics: [
      { label: "母約剩餘額度", value: "NT$ 2.10M", sqlId: "sql:open_contract_balance_v", tone: "good" },
      { label: "本張預估金額", value: "NT$ 180,000", sqlId: "sql:rate_card_estimate_v", tone: "neutral" },
      { label: "額度水位", value: "71%", sqlId: "sql:open_contract_watermark", tone: "neutral" },
    ],
    canvasView: 2,
    canvasTitle: "視圖 ② 開口合約指示單 vs 母約額度比對表",
    actions: [
      { id: "act-create-batch", label: "建派工批次 (子案 -12)", transition: "case:create_subcase_batch", variant: "primary" },
      { id: "act-reject-quota", label: "額度不足退回", transition: "case:reject_work_order", variant: "danger" },
    ],
  },

  // FIELD (外業)
  {
    id: "card-field-1",
    role: "field",
    serial: "業主往來 12096",
    kind: "confirm",
    title: "憑單核准｜台塑 麥寮 D-1 繳銷",
    subtitle: "CAT-04 出入廠憑單核准 · 命中 FPG_PERMIT_5WD（逾期未繳銷罰 NT$1,000＋切結書）",
    assignee: "吳科翰 / 古恆安",
    slaText: "有效至 10/29 (5 工作天)",
    gateBadge: "🚨 綁人綁車 ABC-1234 · D-1 強制提醒",
    evidenceMetrics: [
      { label: "有效工作天", value: "5 天 (至10/29)", sqlId: "sql:permit_workdays_v", tone: "warn" },
      { label: "綁定車輛資產", value: "ABC-1234", sqlId: "sql:permit_vehicle_fk", tone: "neutral" },
      { label: "逾期罰則", value: "NT$ 1,000", sqlId: "sql:client_playbook_fpg", tone: "bad" },
    ],
    canvasView: 4,
    canvasTitle: "視圖 ④ 台塑出入廠憑單 5 工作天規則與派用檢查",
    actions: [
      { id: "act-permit-done", label: "已繳銷憑單", transition: "permit:active-> surrendered", variant: "primary" },
      { id: "act-permit-ext", label: "申請延期 (擬稿)", transition: "outbound:draft_permit_ext", variant: "secondary" },
      { id: "act-permit-swap", label: "改派人車", transition: "reservation:swap_asset", variant: "secondary" },
    ],
  },

  // SETTLEMENT (結算)
  {
    id: "card-settlement-1",
    role: "settlement",
    serial: "業主往來 12098",
    kind: "approve",
    title: "入帳候選｜合庫 NT$849,970",
    subtitle: "CAT-06 銀行通知（永不自動解鎖）· 統編 541**047 命中＋匯費差額 -30 容差內",
    assignee: "財務 (佾均)",
    slaText: "沖帳後立即解鎖 C115094-4 官章成果",
    gateBadge: "🏦 BANK_NOTICE_NEVER_AUTO_UNLOCK (容差 ±100)",
    evidenceMetrics: [
      { label: "候選發票數", value: "1 張 (INV-0187)", sqlId: "sql:bank_notice_match_v", tone: "good" },
      { label: "匯費差額", value: "-30 元 (容差內)", sqlId: "sql:bank_fee_tolerance_v", tone: "good" },
      { label: "發票帳齡", value: "41 天", sqlId: "sql:invoice_aging_v", tone: "neutral" },
    ],
    canvasView: 3,
    canvasTitle: "視圖 ③ 成果放行與入帳沖銷單（合庫 849,970 對 INV-2026-0187）",
    actions: [
      { id: "act-alloc", label: "沖到 INV-2026-0187 (認列30匯費)", transition: "receipt_allocation:confirm_unlock", variant: "primary" },
      { id: "act-split", label: "拆沖多張發票", transition: "receipt_allocation:split_multi", variant: "secondary" },
      { id: "act-not-ours", label: "不是我們的款項", transition: "bank_notice:reject", variant: "danger" },
    ],
  },
  {
    id: "card-settlement-2",
    role: "settlement",
    serial: "業主往來 12101",
    kind: "approve",
    title: "下包請款｜小柯 10月 NT$68,000",
    subtitle: "CAT-07 外包請款單 · 實際 > 預估 13%（毛利影響 28% → 25%）",
    assignee: "財務 / 鍾智偉",
    slaText: "月結審查",
    evidenceMetrics: [
      { label: "預估成本", value: "NT$ 60,000", sqlId: "sql:cost_item_est_v", tone: "neutral" },
      { label: "超支幅度", value: "+13.3%", sqlId: "sql:cost_item_variance_v", tone: "warn" },
      { label: "毛利率變化", value: "28% → 25%", sqlId: "sql:case_month_pl_v", tone: "warn" },
    ],
    canvasView: 5,
    canvasTitle: "視圖 ⑤ 下包請款與毛利影響（C115167-05 小柯請款）",
    actions: [
      { id: "act-pay-sub", label: "核准付款", transition: "cost_item:approve_ap", variant: "primary" },
      { id: "act-return-sub", label: "退回補件 (擬稿)", transition: "outbound:return_subcontractor", variant: "secondary" },
      { id: "act-flag-pm", label: "標超支待 PM 簽認", transition: "cost_item:escalate_pm", variant: "secondary" },
    ],
  },
  {
    id: "card-settlement-3",
    role: "settlement",
    kind: "approve",
    title: "結算待簽｜C115167-05（智偉已簽）",
    subtitle: "C12 總經理雙簽卡 · 電話承諾追加 3 次已全數確認無阻擋 (Blocking=false)",
    assignee: "JK (總經理)",
    slaText: "雙簽後觸發獎金池",
    gateBadge: "✓ C4 鍾智偉已核 · 未結承諾 0 筆",
    evidenceMetrics: [
      { label: "結算毛利率", value: "31.2%", sqlId: "sql:case_settlement_pl_v", tone: "good" },
      { label: "未結口頭承諾", value: "0 筆 (已清)", sqlId: "sql:settlement_commitment_v", tone: "good" },
      { label: "里程碑未收款", value: "NT$ 0", sqlId: "sql:invoice_paid_v", tone: "good" },
    ],
    canvasView: 6,
    canvasTitle: "視圖 ⑥ 結算三方對帳與未結承諾檢查（C115167-05 水深測量）",
    actions: [
      { id: "act-gm-sign", label: "簽核結算 (gm_signed)", transition: "case_settlement:vp_signed->gm_signed", variant: "primary" },
      { id: "act-gm-return", label: "退回智偉 (填原因)", transition: "case_settlement:vp_signed->open", variant: "danger" },
    ],
  },

  // ADMIN (行政)
  {
    id: "card-admin-1",
    role: "admin",
    serial: "業主往來 12103",
    kind: "choose",
    title: "公文待收｜水利署 回覆期限 10/31",
    subtitle: "CAT-05 bizmail.docx.tw 公文攔截（已移除 Gmail 略過收件匣 filter）",
    assignee: "宣蓉 (行政總機)",
    slaText: "法定限期剩 6 天",
    gateBadge: "🏛️ GOV_OFFICIAL_DOC_NUMBER 必配詠發字號",
    evidenceMetrics: [
      { label: "距離回覆期限", value: "6 天", sqlId: "sql:official_doc_due_v", tone: "warn" },
      { label: "公文配號狀態", value: "待配詠發字", sqlId: "sql:official_doc_seq_v", tone: "neutral" },
      { label: "關聯母案", value: "C115208", sqlId: "sql:case_gov_match_v", tone: "neutral" },
    ],
    canvasView: 1,
    canvasTitle: "視圖 ① 機關公文收文與 (115)詠發字號配號檢查",
    actions: [
      { id: "act-doc-reg", label: "登記公文並指派 PM", transition: "official_doc:register_and_assign", variant: "primary" },
      { id: "act-doc-archive", label: "純歸檔備查", transition: "official_doc:archive_only", variant: "secondary" },
    ],
  },
  {
    id: "card-admin-2",
    role: "admin",
    serial: "業主往來 12104",
    kind: "choose",
    title: "勞保帳單｜上準精密 115/09",
    subtitle: "CAT-09 勞保局電子帳單 · 組織隔離 Inv_OrgIsolation 自動識別 org_id=SJ",
    assignee: "佾均 (人事財務)",
    slaText: "月底前沖帳",
    gateBadge: "🛡️ Inv_OrgIsolation (SJ 帳單絕不混入 YX)",
    evidenceMetrics: [
      { label: "判定組織 (org_id)", value: "SJ (上準精密)", sqlId: "sql:org_isolation_guard", tone: "good" },
      { label: "與上月差額", value: "+NT$ 47", sqlId: "sql:hr_private_ins_diff", tone: "neutral" },
      { label: "個資遮罩保護", value: "RLS 已鎖定", sqlId: "sql:rls_hr_private_raw", tone: "good" },
    ],
    canvasView: 6,
    canvasTitle: "視圖 ⑥ 雙公司組織隔離 (YX 詠翔 vs SJ 上準精密) 帳務邊界",
    actions: [
      { id: "act-sj-book", label: "歸 SJ 上準精密入帳", transition: "hr_private_raw:book_org_sj", variant: "primary" },
      { id: "act-quarantine", label: "移入隔離區待查", transition: "backfill_quarantine:hold", variant: "secondary" },
    ],
  },

  // ATTENDANCE (出勤)
  {
    id: "card-att-1",
    role: "attendance",
    kind: "confirm",
    title: "今日點名 7 筆待確認｜09:30 批次",
    subtitle: "羅薇每日點名卡 · 確認完畢後發薪批次鎖定按鈕才可解鎖",
    assignee: "羅薇 (行政人事)",
    slaText: "09:45 前凍結",
    evidenceMetrics: [
      { label: "未確認出勤筆數", value: "7 筆", sqlId: "sql:attendance_unverified_v", tone: "warn" },
      { label: "今日預排出工", value: "38 人", sqlId: "sql:plan_daily_headcount_v", tone: "good" },
      { label: "半天假無證據", value: "2 人", sqlId: "sql:attendance_anomaly_v", tone: "bad" },
    ],
    canvasView: 6,
    canvasTitle: "視圖 ⑥ 點名異常明細與發薪鎖定前置檢查",
    actions: [
      { id: "act-att-confirm", label: "確認 7 筆狀態並凍結", transition: "attendance_day:confirm_batch", variant: "primary" },
      { id: "act-att-rest", label: "其餘照系統預排", transition: "attendance_day:accept_default", variant: "secondary" },
    ],
  },
];

export const DRYRUN_TIMELINE = [
  { serial: "業主往來 12085", cat: "CAT-01", sender: "ctci.com.tw (中鼎)", subj: "高雄港碼頭水深測量詢價與補充規範", status: "已配號 · 恆安認領" },
  { serial: "業主往來 12086", cat: "INTERNAL-CMD", sender: "yong.yx1101 (衛星指令)", subj: "【業主回傳】報編115322 中鼎簽認單回傳", status: "首行已剝除 · 待核發" },
  { serial: "業主往來 12088", cat: "PHONE-10S", sender: "Lark 語音口述 (吳柏頤)", subj: "C115301 黎明張技師電話口頭交辦加測北側200m", status: "雙卡生成 · 48h追蹤" },
  { serial: "業主往來 12089", cat: "CAT-02", sender: "yonginside (衛星指令)", subj: "(成果提供) C115094-4 台塑麥寮官章 DWG 提送", status: "⛔ 未入帳攔截 (差30)" },
  { serial: "業主往來 12092", cat: "CAT-03", sender: "thsrc.com.tw (台灣高鐵)", subj: "C114231 導線施測成果不符合規範，請重測", status: "Playbook 複測範本命中" },
  { serial: "業主往來 12098", cat: "CAT-06", sender: "tcb-bank.com.tw (合庫)", subj: "入帳通知 NT$849,970 (統編 541**047)", status: "候選沖帳 · 容差±100" },
];

export default function PlumbHarmonyInboxA() {
  const [activeRole, setActiveRole] = useState<OwnerRole>("mine");
  const [cards, setCards] = useState<HarmonyCard[]>(INITIAL_CARDS);
  const [actedLog, setActedLog] = useState<{ id: string; title: string; action: string; time: string }[]>([]);
  const [activeCanvasCard, setActiveCanvasCard] = useState<HarmonyCard | null>(INITIAL_CARDS[0]);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const roleCards = cards.filter((c) => c.role === activeRole);
  const countByRole = (r: OwnerRole) => cards.filter((c) => c.role === r).length;

  const handleAction = (card: HarmonyCard, action: CardAction) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    const now = new Date().toLocaleTimeString("zh-TW", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setActedLog((prev) => [{ id: card.id, title: card.title, action: `${action.label} (${action.transition})`, time: now }, ...prev]);
    setToast(`✓ 已執行狀態轉移：${action.transition}（寫入 audit_event）`);
    setTimeout(() => setToast(null), 4000);
  };

  const triggerVoiceMemoPreset = (presetText: string, clientName: string, caseCode: string, scopeText: string) => {
    const newCard: HarmonyCard = {
      id: `card-voice-${Date.now()}`,
      role: activeRole,
      serial: `業主往來 ${12106 + actedLog.length}`,
      kind: "confirm",
      title: `承諾紀錄待確認｜${clientName}`,
      subtitle: `10秒語音口述：「${presetText}」`,
      assignee: "吳柏頤 (PM)",
      slaText: "剛口述 · 48h 倒數啟動",
      evidenceMetrics: [
        { label: "該案未結承諾", value: "1 筆", sqlId: "sql:client_commitment_open_v", tone: "warn" },
        { label: "歷史砍價/變更率", value: "12%", sqlId: "sql:customer_behavior_v", tone: "neutral" },
        { label: "距 48h 剩餘", value: "48.0 h", sqlId: "sql:commitment_sla_clock_v", tone: "good" },
      ],
      proposedFields: [
        { key: "案件", val: caseCode },
        { key: "類型", val: "scope_add (口頭追加)" },
        { key: "範圍數量", val: scopeText },
        { key: "期限", val: "2026-11-05" },
      ],
      canvasView: 2,
      canvasTitle: `視圖 ② 口述承諾對照合約明細（${caseCode} ${clientName}）`,
      dualCard: {
        cardALabel: "卡 A｜內部承諾列 (proposed_fields 待人確認)",
        cardADesc: `確認後寫入 client_commitment(status='stated') 並於 ${caseCode} 自動建預備合約明細。`,
        cardBLabel: "卡 B｜對外書面確認稿 (含 48h 默認條款)",
        cardBDraft: `您好，依剛才電話確認，${caseCode} 案「${scopeText}」一事，我們已排入時程處理；如有不符請於 2 個工作日內回覆更正，謝謝。— 詠翔測量`,
      },
      actions: [
        { id: "act-v-send", label: "確認抽取＋發送 Email", transition: "commitment:stated->written_sent", variant: "primary" },
        { id: "act-v-line", label: "一鍵複製到 LINE", transition: "outbound:copy_line_shadow", variant: "secondary" },
      ],
    };
    setCards((prev) => [newCard, ...prev]);
    setActiveCanvasCard(newCard);
    setChatInput("");
    setToast(`🎙️ 已從 10 秒口述生成「卡 A 內部承諾」＋「卡 B 對外確認稿」！`);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 56px)", background: "#09090b", color: "#fafafa", fontFamily: "var(--font)" }}>
      {/* Top R27/R31 Banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #27272a", background: "#111113", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: 12, padding: "3px 8px", borderRadius: 6 }}>
            Candidate A · Grok Bot 極簡決策流
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Plumb AI 業主往來總機（R27 減法三元件 × R28 書記官 × R30/R31 守門）</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#a1a1aa" }}>
          <span>0 模組選單 · 0 裸表瀏覽 · 3 秒內拍板</span>
          <span style={{ color: "#4ade80", fontWeight: 600 }}>● PG 硬表 + R30 純函數守門 23/23 PASS</span>
        </div>
      </div>

      {toast && (
        <div style={{ background: "#1e3a8a", color: "#eff6ff", padding: "8px 20px", fontSize: 13, fontWeight: 600, borderBottom: "1px solid #3b82f6", display: "flex", justifyContent: "space-between" }}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "#93c5fd", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* Main 3-Column R27 Layout: Left Inbox Rail (<=6 roles) + Center Card Stream + Right Slide-out Canvas */}
      <div style={{ display: "grid", gridTemplateColumns: activeCanvasCard ? "230px minmax(0, 1fr) 440px" : "230px minmax(0, 1fr)", flex: 1, overflow: "hidden" }}>
        
        {/* 1. LEFT RAIL: 6 Owner Agents */}
        <aside style={{ borderRight: "1px solid #27272a", background: "#111113", padding: "14px 10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", padding: "0 8px 8px" }}>
              Owner Agents (GET /inbox?role=)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {OWNER_ROLES.map((r) => {
                const count = countByRole(r.id);
                const active = activeRole === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setActiveRole(r.id);
                      const first = cards.find((c) => c.role === r.id);
                      if (first) setActiveCanvasCard(first);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 10px",
                      borderRadius: 10,
                      border: active ? "1px solid #3b82f6" : "1px solid transparent",
                      background: active ? "rgba(59, 130, 246, 0.14)" : "transparent",
                      color: active ? "#ffffff" : "#d4d4d8",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ color: active ? "#60a5fa" : "#a1a1aa" }}>{r.icon}</span>
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

          <div style={{ borderTop: "1px solid #27272a", paddingTop: 12, fontSize: 12, color: "#a1a1aa" }}>
            <div style={{ fontWeight: 600, color: "#e4e4e7", marginBottom: 4 }}>五條跨模組鐵律保護中</div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "#71717a" }}>
              • 單一 SoT · 零雙向同步<br />
              • 文字是資料，按鈕才是型別動作<br />
              • 48h 無書面影子阻擋結算<br />
              • hr_private 遮罩不可反推
            </div>
          </div>
        </aside>

        {/* 2. CENTER STREAM: Today's Decision Cards */}
        <section style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%", overflowY: "auto", padding: "18px 22px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  今日待你拍板（{roleCards.length} 張卡）
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a1a1aa" }}>
                  按急迫排序 · 標題 ≤40 字 · 3 個數字 100% 綁定 SQL 結果集 (`evidence_sql_ids`)
                </p>
              </div>
              {actedLog.length > 0 && (
                <span style={{ fontSize: 12, color: "#4ade80", background: "rgba(74, 222, 128, 0.12)", padding: "4px 10px", borderRadius: 999 }}>
                  今日已拍板 {actedLog.length} 筆
                </span>
              )}
            </div>

            {roleCards.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", border: "1px dashed #27272a", borderRadius: 14, background: "#111113" }}>
                <CheckCircle2 size={36} color="#4ade80" style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 16, fontWeight: 700 }}>今天沒有需要你的決定（今日已清空）</div>
                <div style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>下一張預計出現的卡：17:00 外業出工回報 / 業主回信自動觸發</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {roleCards.map((card) => {
                  const isSelected = activeCanvasCard?.id === card.id;
                  return (
                    <div
                      key={card.id}
                      style={{
                        border: isSelected ? "1.5px solid #3b82f6" : "1px solid #27272a",
                        borderRadius: 14,
                        background: "#131316",
                        padding: 16,
                        boxShadow: isSelected ? "0 0 0 3px rgba(59,130,246,0.15)" : "none",
                      }}
                    >
                      {/* Top row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {card.serial && (
                            <span style={{ fontSize: 11, fontFamily: "var(--mono)", background: "#1e293b", color: "#93c5fd", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                              {card.serial}
                            </span>
                          )}
                          <span style={{ fontSize: 11, background: "#27272a", color: "#e4e4e7", padding: "2px 8px", borderRadius: 6 }}>
                            收件人：{card.assignee}
                          </span>
                          {card.gateBadge && (
                            <span style={{ fontSize: 11, background: card.gateBadge.startsWith("⛔") ? "rgba(220,38,38,0.18)" : "rgba(37,99,235,0.18)", color: card.gateBadge.startsWith("⛔") ? "#fca5a5" : "#93c5fd", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                              {card.gateBadge}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={12} /> {card.slaText}
                        </span>
                      </div>

                      {/* Title & Subtitle */}
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>{card.title}</div>
                      <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 12 }}>{card.subtitle}</div>

                      {/* 3 SQL-Backed Evidence Numbers (Red-Team #6 strict compliance) */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
                        {card.evidenceMetrics.map((m, idx) => (
                          <div key={idx} style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: "8px 10px" }}>
                            <div style={{ fontSize: 11, color: "#a1a1aa", display: "flex", justifyContent: "space-between" }}>
                              <span>{m.label}</span>
                              <code style={{ fontSize: 10, color: "#60a5fa" }}>{m.sqlId}</code>
                            </div>
                            <div
                              style={{
                                fontSize: 15,
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

                      {/* Proposed Fields for Voice Memo Confirm Cards (Red-Team #6) */}
                      {card.proposedFields && (
                        <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>
                            🎙️ Agent 語音抽取欄位（proposed_fields · 待人工確認後才寫入硬表）
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12 }}>
                            {card.proposedFields.map((pf, i) => (
                              <span key={i} style={{ background: "#18181b", padding: "3px 8px", borderRadius: 6, border: "1px solid #3f3f46" }}>
                                <strong style={{ color: "#a1a1aa" }}>{pf.key}：</strong>
                                <span style={{ color: "#fff", fontWeight: 600 }}>{pf.val}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Dual Card A + Card B preview for R28 Phone Memo */}
                      {card.dualCard && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 10, marginBottom: 12 }}>
                          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>{card.dualCard.cardALabel}</div>
                            <div style={{ fontSize: 12, color: "#d4d4d8", lineHeight: 1.4 }}>{card.dualCard.cardADesc}</div>
                          </div>
                          <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>{card.dualCard.cardBLabel}</div>
                            <div style={{ fontSize: 12, color: "#e4e4e7", lineHeight: 1.4, fontFamily: "var(--mono)" }}>{card.dualCard.cardBDraft}</div>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons (<=3 buttons + View Canvas button) */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 6, borderTop: "1px solid #27272a" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {card.actions.map((act) => (
                            <button
                              key={act.id}
                              onClick={() => handleAction(card, act)}
                              style={{
                                padding: "7px 14px",
                                borderRadius: 8,
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: "pointer",
                                border: act.variant === "primary" ? "none" : "1px solid #3f3f46",
                                background: act.variant === "primary" ? "#2563eb" : act.variant === "danger" ? "rgba(220,38,38,0.15)" : "#18181b",
                                color: act.variant === "danger" ? "#fca5a5" : "#ffffff",
                              }}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setActiveCanvasCard(card)}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            background: isSelected ? "rgba(59,130,246,0.2)" : "transparent",
                            border: "1px solid #3b82f6",
                            color: "#93c5fd",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          看明細 (視圖 #{card.canvasView}) <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. BOTTOM CHATBAR: 10-Second Voice Memo & Natural Command Bar */}
          <div style={{ marginTop: 20, borderTop: "1px solid #27272a", paddingTop: 14, background: "#09090b" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Mic size={14} /> 掛電話對 Agent 講 10 秒（點選下方真實劇本，立即在收件匣長出「承諾卡 A + 對外確認稿卡 B」）：
              </span>
              <span style={{ fontSize: 11, color: "#71717a" }}>對內一句話 → 絕不直接外發，必長確認卡</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button
                onClick={() =>
                  triggerVoiceMemoPreset(
                    "剛才中興王經理電話，C115211-1 要求北側管線圖延後到 11/5 交付，並追加 3 點控制點檢測",
                    "中興工程 王經理",
                    "C115211-1",
                    "追加 3 點控制點檢測＋管線圖延至 11/5"
                  )
                }
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, background: "#1e293b", border: "1px solid #3b82f6", color: "#bfdbfe", cursor: "pointer" }}
              >
                🎙️ 示範口述 1：「中興王經理電話追加 3 點控制點…」
              </button>
              <button
                onClick={() =>
                  triggerVoiceMemoPreset(
                    "通鋯陳課長電話說 C115309 地形測量如果本週五前給初稿，尾款同意不扣保留款",
                    "通鋯企業 陳課長",
                    "C115309",
                    "本週五前交初稿免扣 5% 保留款"
                  )
                }
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, background: "#1e293b", border: "1px solid #3b82f6", color: "#bfdbfe", cursor: "pointer" }}
              >
                🎙️ 示範口述 2：「通鋯陳課長電話承諾週五交圖免扣保留款…」
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="對 Agent 講 10 秒或輸入例外問題（例如：把 C115301 報價寄給中興王經理）..."
                style={{ flex: 1, background: "#18181b", border: "1px solid #3f3f46", color: "#fff", borderRadius: 10, padding: "8px 12px" }}
              />
              <button
                onClick={() => {
                  if (!chatInput.trim()) return;
                  triggerVoiceMemoPreset(chatInput, "指定業主聯絡人", "C115301", chatInput);
                }}
                style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <Send size={14} /> 轉成拍板卡
              </button>
            </div>
          </div>
        </section>

        {/* 4. RIGHT SLIDE-OUT CANVAS: Single Pre-filtered View (Views 1..6) */}
        {activeCanvasCard && (
          <aside style={{ borderLeft: "1px solid #27272a", background: "#111113", padding: 18, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #27272a", paddingBottom: 10 }}>
              <div>
                <span style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>
                  GET /canvas/{activeCanvasCard.id} · 單一預篩視圖 #{activeCanvasCard.canvasView}
                </span>
                <h3 style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 700 }}>{activeCanvasCard.canvasTitle}</h3>
              </div>
              <button
                onClick={() => setActiveCanvasCard(null)}
                style={{ background: "#27272a", border: "none", color: "#e4e4e7", borderRadius: 6, width: 28, height: 28, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* SQL Evidence Provenance Bar */}
            <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, padding: 10, fontSize: 12 }}>
              <div style={{ color: "#a1a1aa", fontWeight: 600, marginBottom: 4 }}>本卡數字來源 (100% 硬表 SQL · 零向量猜測)：</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeCanvasCard.evidenceMetrics.map((m, i) => (
                  <code key={i} style={{ background: "#09090b", color: "#4ade80", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
                    {m.sqlId} = {m.value}
                  </code>
                ))}
              </div>
            </div>

            {/* Dynamic Canvas Body by View 1..6 */}
            {activeCanvasCard.canvasView === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>原衛星指令信（已攔截並剝除首行）：</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#fca5a5", textDecoration: "line-through" }}>
                    寄件人：倢瑛(yong.yx1101) 麻煩幫我寄給中鼎卓育賢先生 #14行政 報編115322
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", marginTop: 10, marginBottom: 4 }}>業主會看到的最終信前 3 行（quote_return_reply v2）：</div>
                  <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "#e4e4e7", background: "#09090b", padding: 8, borderRadius: 6 }}>
                    卓先生您好：{"\n"}已收到貴單位回傳之報價簽認單（報價編號 115322），本案由專案經理 古恆安 負責。{"\n"}後續將由 古恆安 與您確認進場時間與所需資料。
                  </div>
                </div>
                <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>outbound_guard() 6 道確定性守門檢查單：</div>
                  {[
                    "✓ 內部指令首行剝除鎖 (INTERNAL_PATTERNS 0 命中)",
                    "✓ 禁詞鎖（無 成本/毛利/底價/A-B-C預算/點數單價）",
                    "✓ 收件人白名單鎖（contact.customer_id = case.customer_id）",
                    "✓ 業主投遞限制鎖（台塑 no_links / 機關詠發字號）",
                    "✓ 附件 FK 白名單鎖（僅核定版 quote_version / deliverable）",
                    "✓ 官章入帳鎖（sealed_release_allowed 交易內 FOR UPDATE）",
                  ].map((g, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#4ade80", padding: "3px 0" }}>{g}</div>
                  ))}
                </div>
              </div>
            )}

            {activeCanvasCard.canvasView !== 1 && (
              <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", marginBottom: 8 }}>
                  對照視圖資料（已依角色裁剪 [MASKED_HR_PRIVATE]）：
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #27272a", color: "#a1a1aa", textAlign: "left" }}>
                      <th style={{ padding: "6px 4px" }}>項目 / 編號</th>
                      <th style={{ padding: "6px 4px" }}>合約/標準</th>
                      <th style={{ padding: "6px 4px" }}>本卡狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #27272a" }}>
                      <td style={{ padding: "6px 4px" }}>C115301 北側 200m</td>
                      <td style={{ padding: "6px 4px" }}>原約未含北側</td>
                      <td style={{ padding: "6px 4px", color: "#fbbf24" }}>自動建預備明細 (追加)</td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid #27272a" }}>
                      <td style={{ padding: "6px 4px" }}>INV-2026-0187</td>
                      <td style={{ padding: "6px 4px" }}>應收 NT$850,000</td>
                      <td style={{ padding: "6px 4px", color: "#4ade80" }}>合庫入帳 849,970 (差30匯費)</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "6px 4px" }}>C115167-05 結算</td>
                      <td style={{ padding: "6px 4px" }}>毛利 31.2%</td>
                      <td style={{ padding: "6px 4px", color: "#4ade80" }}>智偉已核 · 未結承諾 0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Live Timeline 12085~12105 */}
            <div style={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                《業主往來紀錄表》單調流水號投影（12,084 歷史列 + 12085+ 實況）：
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {DRYRUN_TIMELINE.map((item, idx) => (
                  <div key={idx} style={{ fontSize: 11, padding: 8, borderRadius: 6, background: "#09090b", border: "1px solid #27272a" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#60a5fa", fontWeight: 700 }}>
                      <span>{item.serial} · {item.cat}</span>
                      <span style={{ color: item.status.includes("⛔") ? "#f87171" : "#4ade80" }}>{item.status}</span>
                    </div>
                    <div style={{ color: "#e4e4e7", marginTop: 2 }}>{item.subj}</div>
                    <div style={{ color: "#71717a", fontSize: 10 }}>來源：{item.sender}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
