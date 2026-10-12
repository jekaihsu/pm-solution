// Report and data-source registry, based on the PM handover spec (R01–R10, S1–S11).
// Base / table / view IDs are identifiers, not secrets: access is granted by the
// Lark app credentials in the server environment.

export interface SourceDef {
  key: string;
  name: string;
  baseToken?: string; // empty = source not located yet
  tableId?: string;
  viewId?: string;
  dateField?: string; // business date used for week filtering; auto-picked when unset
  url?: string;
  note?: string;
}

const MAIN_BASE = "Sdw1bG1djaHsVGsRPvmjyVWipgg";
const SALES_BASE = "JoOqbggsVar0ATsVgbcjh6IIp1g";
const WR_BASE = "HnAzbA4m1aoGQfsxaxPjXMCBpob"; // WR1.1 trial tables
const LARK_WEB = "https://yong-xiang-survey.jp.larksuite.com";

export const SOURCES: SourceDef[] = [
  {
    key: "field-work",
    name: "外業工作單",
    baseToken: MAIN_BASE,
    tableId: "tbl97f1uXqi7Qz0k",
    viewId: "vew90LcVgL",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tbl97f1uXqi7Qz0k&view=vew90LcVgL`,
    note: "R01 與 R10 共用同一批工作單，跨報告不可相加。",
  },
  {
    key: "schedule",
    name: "工作預排",
    baseToken: MAIN_BASE,
    tableId: "tblN8c3WN44233aG",
    viewId: "vewXmhLDA0",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tblN8c3WN44233aG&view=vewXmhLDA0`,
  },
  {
    key: "receivables",
    name: "案件應收未收",
    baseToken: MAIN_BASE,
    tableId: "tblWsSaOcy4nKuGI",
    viewId: "vewUGIqzfl",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tblWsSaOcy4nKuGI&view=vewUGIqzfl`,
    note: "視圖為空不代表應收為零。",
  },
  {
    key: "equipment",
    name: "儀器費率",
    baseToken: MAIN_BASE,
    tableId: "tblfgeEtMuBTg72O",
    viewId: "vew0DG8LOx",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tblfgeEtMuBTg72O&view=vew0DG8LOx`,
    note: "費率表不等於完整資產台帳；租金缺值是未知，不是免費。",
  },
  {
    key: "quotes",
    name: "報價總表",
    baseToken: SALES_BASE,
    tableId: "tblENZvYAya93Twa",
    url: `${LARK_WEB}/base/${SALES_BASE}?table=tblENZvYAya93Twa`,
  },
  {
    key: "owner-contacts",
    name: "業主連絡資訊表",
    baseToken: SALES_BASE,
    tableId: "tbl4fmZN6cBB7u1d",
    viewId: "vewiP0FJer",
    url: `${LARK_WEB}/base/${SALES_BASE}?table=tbl4fmZN6cBB7u1d&view=vewiP0FJer`,
    note: "通訊錄，不是聯繫紀錄，不能算聯繫次數。",
  },
  {
    key: "internal-work",
    name: "內業工作單",
    baseToken: MAIN_BASE,
    tableId: "tblTP5Naz52FBpFg",
    viewId: "vewWGbfbdB",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tblTP5Naz52FBpFg&view=vewWGbfbdB`,
    note: "R02 與 R09 共用；「最終營業額點數」欄名含「最終」不代表已核定。",
  },
  {
    key: "internal-cost",
    name: "內業成本單",
    baseToken: MAIN_BASE,
    tableId: "tbl8JdWLLwlPFuoF",
    viewId: "vewsBdznYd",
    url: `${LARK_WEB}/base/${MAIN_BASE}?table=tbl8JdWLLwlPFuoF&view=vewsBdznYd`,
  },
  {
    key: "report-delivery",
    name: "週報交付版本（WR1.1 試用）",
    baseToken: WR_BASE,
    tableId: "tbl7PHyUKEgRynag",
    viewId: "vewKiCq852",
    url: `${LARK_WEB}/base/${WR_BASE}?table=tbl7PHyUKEgRynag&view=vewKiCq852`,
    note: "試用表；正式使用中的成果送出／業主回饋紀錄尚未找到。Meego／Meegle 期程來源未接通。",
  },
  {
    key: "hr",
    name: "招聘 / 出勤 / 出差",
    url: `${LARK_WEB}/wiki/S9DnwFRi5iEplKkUJvpj2hv3pQc`,
    note: "招聘候選人池含個人資料，可見範圍（D-09）核定前不接入；出勤／出差在 Lark 差勤與審批，不是多維表格。",
  },
  {
    key: "contact-log",
    name: "業主聯繫紀錄",
    note: "尚未找到正式使用中的資料表。候選：CRM 雛型「跟進與拜訪紀錄」（測試資料）、舊版 v2「⑬業主聯繫紀錄表」（目前 0 筆），皆未接入。",
  },
];

export const sourceByKey = (key: string) => SOURCES.find((s) => s.key === key);
export const isLocated = (s: SourceDef) => Boolean(s.baseToken && s.tableId);

export interface ReportDef {
  id: string; // R01..R10
  slug: string;
  name: string;
  purpose: string;
  sources: string[]; // source keys
  mustHave: string[]; // business content the spec requires
  pending: string[]; // definitions not yet decided — shown, never computed
}

export const REPORTS: ReportDef[] = [
  {
    id: "R01",
    slug: "r01",
    name: "控制組檢查後數據",
    purpose: "讓 PM 與外業主管看各組上週的已檢查工作量、差異及異常，作為追蹤及派工討論依據。",
    sources: ["field-work"],
    mustHave: ["每組上週營業額", "失誤率", "異常狀態", "工作項目／編號／數量（帶單位）", "營業額與預排差異", "是否符合 SOP", "是否可安排新工作"],
    pending: ["失誤率的分子與分母（D-04）", "預排營業額基準、換算係數與差異方向（D-02）", "SOP 與可派新工作由誰確認（D-04）"],
  },
  {
    id: "R02",
    slug: "r02",
    name: "內業檢查",
    purpose: "檢查內業實際數量、工項及產值差異，另向業主呈現進度。",
    sources: ["internal-work", "internal-cost"],
    mustHave: ["每組營業額", "失誤率", "異常", "工作項目／編號／數量", "預排差異", "SOP", "業主進度（百分比／天數）"],
    pending: ["內業工項換算（D-02）", "失誤率分母（D-04）", "業主進度百分比分母與剩餘天數算法"],
  },
  {
    id: "R03",
    slug: "r03",
    name: "報告檢查",
    purpose: "追蹤內業成果的品管、期程、送出與業主回饋，找出已完成未送出、已送出未登記等斷點。",
    sources: ["report-delivery"],
    mustHave: ["期程 N+123", "內業品管檢核後數據", "完成／品管通過／送出／業主核定分開"],
    pending: ["N 起點、+1／+2／+3 節點、日曆日或工作日、重送規則（D-05）"],
  },
  {
    id: "R04",
    slug: "r04",
    name: "人事數據",
    purpose: "讓授權主管掌握招聘、出勤及出差的營運狀態與待處理事項。",
    sources: ["hr"],
    mustHave: ["招聘", "出勤紀錄", "出差紀錄"],
    pending: ["出勤率分母與請假／補卡規則", "招聘口徑", "可見範圍與敏感欄位（D-09）"],
  },
  {
    id: "R05",
    slug: "r05",
    name: "業務數據",
    purpose: "呈現接案、報價與成交情形，以及前期範圍確認造成的待辦。",
    sources: ["quotes"],
    mustHave: ["接案量", "成交量", "報價狀態"],
    pending: ["接案按詢價、新報價或立案計", "成交按回簽、確認單或契約計", "報價版本去重規則"],
  },
  {
    id: "R06",
    slug: "r06",
    name: "請款詳情數據",
    purpose: "分開看可請款、已請款、未收款及實際入帳，協助 PM 與行政追蹤。",
    sources: ["receivables"],
    mustHave: ["可請款", "已請款", "未收款", "實際入帳", "內外業成本"],
    pending: ["可請款未請、應收未收、成本公式（D-07）", "部分請款、分次入帳、折讓、幣別／稅別處理"],
  },
  {
    id: "R07",
    slug: "r07",
    name: "儀器車輛管理詳情",
    purpose: "掌握儀器／車輛可用狀態、抽檢異常與改善進度。",
    sources: ["equipment"],
    mustHave: ["儀器抽檢", "車內整理", "設備損壞與改善"],
    pending: ["資產範圍與同物異名去重", "停用／送修及保養日曆定義"],
  },
  {
    id: "R08",
    slug: "r08",
    name: "業主聯繫紀錄",
    purpose: "掌握所有進行中案件的業主聯繫、進度回報及待辦。",
    sources: ["contact-log", "owner-contacts"],
    mustHave: ["每個進行中案件都要涵蓋", "聯繫日期、負責人、摘要、待辦、下次追蹤日"],
    pending: ["最小欄位與每案聯繫頻率（D-08）", "進行中案件定義（D-06）"],
  },
  {
    id: "R09",
    slug: "r09",
    name: "內業報告",
    purpose: "內業部門看預排與實際執行對照，以及所有進行中工作的剩餘營業額。",
    sources: ["schedule", "internal-work", "internal-cost"],
    mustHave: ["預排達成率（以工程編號為主）", "進行中工作營業額剩餘"],
    pending: ["達成率粒度、基準版本、改排及例外（D-03）", "剩餘點數與內外業分攤（D-06）"],
  },
  {
    id: "R10",
    slug: "r10",
    name: "外業報告",
    purpose: "外業部門看工程編號層級的預排執行差異與所有進行中工作餘量。",
    sources: ["field-work", "schedule"],
    mustHave: ["預排達成率（以工程編號為主）", "進行中工作營業額剩餘"],
    pending: ["外業分母粒度、延期、停工、委外規則（D-03）", "剩餘點數避免內外業重疊（D-06）"],
  },
];

export const reportBySlug = (slug: string) => REPORTS.find((r) => r.slug === slug);
