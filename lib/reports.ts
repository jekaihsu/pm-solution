// Report and data-source registry, based on the PM handover spec (R01–R10, S1–S11).
// Base / table / view IDs are identifiers, not secrets: access is granted by the
// Lark app credentials in the server environment.

export type DataVersion = "v3" | "v4";

export interface SourceDef {
  key: string;
  name: string;
  version?: DataVersion; // 詠翔日報系統版本；不分版本的來源留空
  baseToken?: string; // empty = source not located yet
  tableId?: string;
  viewId?: string; // only set when the view's filter is intended; raw tables read in full
  dateField?: string; // business date used for week filtering; auto-picked when unset
  createdAfter?: number; // epoch ms: drop records created before this (or with unknown creation time)
  createdAfterLabel?: string;
  columns?: string[]; // key columns shown by default (names that don't exist are skipped)
  metrics?: string[]; // number fields summed on the dashboard (raw values, not approved figures)
  dims?: string[]; // category fields the dashboard groups by
  url?: string;
  note?: string;
  tableName?: RegExp; // find the table by name when tableId is not known
  allowField?: (name: string) => boolean; // read ONLY these fields from Lark (sensitive tables)
  restricted?: "hr"; // only HR_VIEWERS may load it
}

// 薪水總表: only overtime hours/days plus who/when. Pay amounts, base salary,
// totals, deductions and IDs are never requested from Lark.
const SALARY_DENY = /費|金額|薪|資|扣|保|獎|津貼|補助|帳|身分|身份|電話|地址|銀行|稅|實領|應發|合計|總額/;
const SALARY_ALLOW = /加班|姓名|員工|人員|名字|組別|部門|月份|年月|期間|日期|年度|月/;
export const salaryField = (name: string) =>
  /^(薪資|計薪)月份$/.test(name) || (SALARY_ALLOW.test(name) && !SALARY_DENY.test(name.replace(/加班(時數|天數|小時)(合計)?/, "")));

const V3 = "Sdw1bG1djaHsVGsRPvmjyVWipgg"; // 詠翔日報系統 v3
const V4 = "H7W6b0PFWaVF1BsgqXJj3pQ9pXb"; // 詠翔日報系統 V4
const SALES_BASE = "JoOqbggsVar0ATsVgbcjh6IIp1g";
const SALARY_BASE = "VwAsbezz9app3YsramgjduLYp2U"; // 薪水總表
const LARK_WEB = "https://yong-xiang-survey.jp.larksuite.com";

// V4 service inclusion baseline: 2026-10-07 20:10:44.122 Asia/Taipei. Records created
// earlier (the 535 legacy test rows) are permanently excluded.
const V4_BASELINE = Date.UTC(2026, 9, 7, 12, 10, 44, 122);
const V4_RULE = { createdAfter: V4_BASELINE, createdAfterLabel: "2026-10-07 20:10:44（台北）" };

// Default visible columns, matched by field name; V3 and V4 share most names.
const COLS = {
  fieldWork: ["工作單號", "出工日期", "出工日", "工作日期", "組別", "出工人", "所屬案件", "案件編號", "合約工項", "完成數量", "計價數量", "營業額點數", "最終營業額點數", "檢核狀態", "控制組檢核", "外業經理檢核", "是否重工"],
  fieldCost: ["單號", "工作日期", "組別", "組長", "出工人數", "當日營業額點數總和", "出工成本總計", "檢核狀態", "外業經理檢核", "工務助理檢核"],
  internalWork: ["工作單號", "姓名", "所屬案件", "案件編號", "內業工項", "計價數量", "營業額點數", "最終營業額點數", "品管檢核", "雅雯檢核", "檢核時間", "是否重工"],
  internalCost: ["單號", "工作日期", "組別", "所屬組別", "內業組別", "填報人", "當日營業額點數總和", "出工成本總計", "內業組長檢核", "PM檢核"],
  schedule: ["日期", "開始日期", "結束日期", "業別", "組別", "人員", "案件", "工作內容", "車輛", "儀器"],
};

// Dashboard defaults: numeric fields to total and categories to break down by.
const DASH = {
  fieldWork: { metrics: ["最終營業額點數", "營業額點數", "完成數量"], dims: ["組別", "出工人", "所屬案件", "合約工項", "檢核狀態"] },
  fieldCost: { metrics: ["當日營業額點數總和", "出工成本總計", "出工人數"], dims: ["組別", "組長", "檢核狀態"] },
  internalWork: { metrics: ["最終營業額點數", "營業額點數", "計價數量"], dims: ["姓名", "所屬案件", "內業工項", "品管檢核"] },
  internalCost: { metrics: ["當日營業額點數總和", "出工成本總計"], dims: ["組別", "所屬組別", "內業組別", "填報人", "PM檢核"] },
  schedule: { metrics: [], dims: ["組別", "業別", "人員", "案件"] },
};

const tableUrl = (base: string, table: string, view?: string) => `${LARK_WEB}/base/${base}?table=${table}${view ? `&view=${view}` : ""}`;

function raw(key: string, name: string, version: DataVersion, table: string, extra: Partial<SourceDef> = {}): SourceDef {
  const base = version === "v3" ? V3 : V4;
  return {
    key,
    name,
    version,
    baseToken: base,
    tableId: table,
    url: table ? tableUrl(base, table) : `${LARK_WEB}/base/${base}`,
    ...(version === "v4" ? V4_RULE : {}),
    ...extra,
  };
}

// 儀器管理系統 Base：PM週報 應用已實測可讀全部 5 張表。
const EQUIP_BASE = "YHqcbb8MHa4VdGsA0UnjajNDpgd";
// 預約單／歸還單不讀申請人、處理人等人員欄位。
const BOOKING_FIELD = (name: string) => !/发起人|当前处理人|审批节点|审批流程/.test(name);
function eqSys(key: string, name: string, table: string, note: string, extra: Partial<SourceDef> = {}): SourceDef {
  return { key, name, baseToken: EQUIP_BASE, tableId: table, url: tableUrl(EQUIP_BASE, table), note, ...extra };
}

export const SOURCES: SourceDef[] = [
  raw("v3-field-work", "外業工作單", "v3", "tbl97f1uXqi7Qz0k", { dateField: "出工日期", columns: COLS.fieldWork, ...DASH.fieldWork, note: "R01 與 R10 共用同一批工作單，跨報告不可相加。" }),
  raw("v4-field-work", "外業工作單", "v4", "tbl5zPLS0ExWNEty", { dateField: "工作日期-薪資", columns: COLS.fieldWork, ...DASH.fieldWork, note: "R01 與 R10 共用；欄名含「最終」不代表已核定。" }),
  raw("v4-field-cost", "外業成本單", "v4", "tbl8wRYCUCvbSoJG", { dateField: "工作日期", columns: COLS.fieldCost, ...DASH.fieldCost }),
  raw("v3-field-cost", "外業成本單", "v3", "tblQCy3eU0wsUj1I", { dateField: "工作日期", columns: COLS.fieldCost, ...DASH.fieldCost, note: "R01 用來判定一組拆成多組出工（同組同日組長不同）。" }),
  raw("v3-internal-work", "內業工作單", "v3", "tblTP5Naz52FBpFg", { columns: COLS.internalWork, ...DASH.internalWork, note: "R02 與 R09 共用；「最終營業額點數」欄名含「最終」不代表已核定。" }),
  raw("v4-internal-work", "內業工作單", "v4", "tblrCo8KeZiuJUNh", { columns: COLS.internalWork, ...DASH.internalWork, note: "R02、R03、R09 共用；含品管檢核、業主數量覆寫欄位。" }),
  raw("v3-internal-cost", "內業成本單", "v3", "tbl8JdWLLwlPFuoF", { dateField: "工作日期", columns: COLS.internalCost, ...DASH.internalCost }),
  raw("v4-internal-cost", "內業成本單", "v4", "tblKwSDRg6WaGHYr", { dateField: "工作日期", columns: COLS.internalCost, ...DASH.internalCost }),
  raw("v3-schedule", "工作預排", "v3", "tblN8c3WN44233aG", { columns: COLS.schedule, ...DASH.schedule }),
  raw("v4-schedule", "工作預排", "v4", "tblZz6Mkhv9gHrB2", { dateField: "開始日期", columns: COLS.schedule, ...DASH.schedule }),
  raw("v3-admin-work", "行政工作單", "v3", "tbl2c5CLgwPZ3Pl2", { note: "R11 用；沒有日期與人員，從「所屬成本單」帶入。" }),
  raw("v3-admin-cost", "行政成本單", "v3", "tbliyB0wgDhgUQbA", { dateField: "工作日期", note: "R11 用；填表人＝看板的一列。" }),
  // V4 行政表的 table id 未知，用表名自動找；應用目前讀不到（1254302），頁面會顯示失敗原因。
  raw("v4-admin-work", "行政工作單", "v4", "", { tableId: undefined, tableName: /行政工作單/ }),
  raw("v4-admin-cost", "行政成本單", "v4", "", { tableId: undefined, tableName: /行政成本單/, dateField: "工作日期" }),
  raw("v3-equipment", "儀器費率", "v3", "tblfgeEtMuBTg72O", { note: "費率表不等於完整資產台帳；租金缺值是未知，不是免費。" }),
  raw("v4-equipment", "儀器費率", "v4", "tblg3Fo23T6Gos6S", {
    createdAfter: undefined,
    createdAfterLabel: undefined,
    note: "主檔資料，不套用 V4 納入基準。費率表不等於完整資產台帳。",
  }),
  raw("v4-vehicles", "車輛", "v4", "tblTQv8l5ntnbwyp", { createdAfter: undefined, createdAfterLabel: undefined, note: "主檔資料，不套用 V4 納入基準。" }),
  {
    key: "receivables",
    name: "案件應收未收",
    version: "v3",
    baseToken: V3,
    tableId: "tblWsSaOcy4nKuGI",
    viewId: "vewUGIqzfl",
    url: tableUrl(V3, "tblWsSaOcy4nKuGI", "vewUGIqzfl"),
    note: "視圖為空不代表應收為零。V4 未找到明確請款表。",
  },
  {
    key: "quotes",
    name: "報價總表",
    baseToken: SALES_BASE,
    tableId: "tblENZvYAya93Twa",
    url: tableUrl(SALES_BASE, "tblENZvYAya93Twa"),
  },
  {
    key: "owner-contacts",
    name: "業主連絡資訊表",
    baseToken: SALES_BASE,
    tableId: "tbl4fmZN6cBB7u1d",
    viewId: "vewiP0FJer",
    url: tableUrl(SALES_BASE, "tbl4fmZN6cBB7u1d", "vewiP0FJer"),
    note: "通訊錄，不是聯繫紀錄，不能算聯繫次數。",
  },
  { key: "report-delivery", name: "成果送出 / 業主回覆", note: "V3、V4 都未找到明確的成果送出或業主回覆紀錄表；N+123 期程規則未定。" },
  {
    key: "hr",
    name: "招聘 / 出勤 / 出差",
    url: `${LARK_WEB}/wiki/S9DnwFRi5iEplKkUJvpj2hv3pQc`,
    note: "招聘候選人池含個人資料，可見範圍（D-09）核定前不接入；出勤／出差在 Lark 差勤與審批，不是多維表格。",
  },
  {
    key: "salary-overtime",
    name: "薪水總表（加班）",
    baseToken: SALARY_BASE,
    tableName: /薪水總表|薪資總表|薪水|薪資/,
    allowField: (n) => salaryField(n),
    restricted: "hr",
    url: `${LARK_WEB}/base/${SALARY_BASE}`,
    note: "只讀加班時數／天數與人員、組別、月份欄位；底薪、總薪資等其他欄位一律不讀。僅 HR_VIEWERS 名單可看。",
  },
  // R07: 儀器管理系統 Base（業主 2026-10-13 提供）。與 V3／V4 的儀器費率、車輛分開，不相加、不去重。
  eqSys("equipment-system", "儀器管理系統：儀器總表（借用台帳）", "tblHZFEypeKfWOsF", "138 筆台帳，含租賃型態（月租／日租）、借用狀態（可借用／已借出）、系統封存；與「資料表」命名不同，兩者不去重。"),
  eqSys("equipment-rates", "儀器管理系統：資料表（儀器費率清單）", "tblZmvrjDC5Q3sIp", "含日租金、啟用、狀態（正常／送修-損壞／出險）；與「儀器總表」是兩份清單，不去重、不相加。"),
  eqSys("equipment-vehicles", "儀器管理系統：車輛", "tblYUUwi0MEGuLZ0", "保養到期、保險到期取自本表；與 V4 車輛主檔分開，不相加。", { columns: ["車牌", "狀態", "current_mileage", "next_maintenance", "insurance_date", "insurance_company", "maintenance_company"] }),
  eqSys("equipment-bookings", "儀器管理系統：儀器預約申請單", "tblVLETpvLxMNwaC", "借出以「已通过」且借出日期落在所選週計；已撤回另計。不讀申請人、處理人欄位。", { allowField: BOOKING_FIELD, dateField: "借出日期" }),
  eqSys("equipment-returns", "儀器管理系統：儀器管理歸還單", "tbl2qFvPOihhe3R1", "歸還以「已通过」且歸還日期落在所選週計；已撤回另計。不讀申請人、處理人欄位。", { allowField: BOOKING_FIELD, dateField: "歸還日期" }),
  { key: "equipment-inspection", name: "月租儀器／車輛檢查紀錄", note: "尚未定位：請提供檢查紀錄所在的 Base／資料表。" },
  { key: "equipment-calibration", name: "TAF／自校驗紀錄", note: "尚未定位：請提供 TAF 與自校驗紀錄所在的 Base／資料表。" },
  {
    key: "contact-log",
    name: "業主聯繫紀錄",
    note: "尚未找到正式使用中的資料表。候選：CRM 雛型「跟進與拜訪紀錄」（測試資料）、舊版 v2「⑬業主聯繫紀錄表」（目前 0 筆），皆未接入。",
  },
];

export const VERSION_LABEL: Record<DataVersion, string> = { v3: "V3", v4: "V4" };
export const sourceLabel = (s: SourceDef) => (s.version ? `${s.name}（${VERSION_LABEL[s.version]}）` : s.name);

export const sourceByKey = (key: string) => SOURCES.find((s) => s.key === key);
export const isLocated = (s: SourceDef) => Boolean(s.baseToken && (s.tableId || s.tableName));

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
    sources: ["v3-field-work", "v3-field-cost", "v4-field-work", "v4-field-cost"],
    mustHave: ["每組上週營業額", "失誤率", "異常狀態", "工作項目／編號／數量（帶單位）", "營業額與預排差異", "是否符合 SOP", "是否可安排新工作"],
    pending: ["失誤率的分子與分母（D-04）", "預排營業額基準、換算係數與差異方向（D-02）", "SOP 與可派新工作由誰確認（D-04）"],
  },
  {
    id: "R02",
    slug: "r02",
    name: "內業檢查",
    purpose: "檢查內業實際數量、工項及產值差異，另向業主呈現進度。",
    sources: ["v3-internal-work", "v3-internal-cost", "v4-internal-work", "v4-internal-cost"],
    mustHave: ["每組營業額", "失誤率", "異常", "工作項目／編號／數量", "預排差異", "SOP", "業主進度（百分比／天數）"],
    pending: ["內業工項換算（D-02）", "失誤率分母（D-04）", "業主進度百分比分母與剩餘天數算法"],
  },
  {
    id: "R03",
    slug: "r03",
    name: "報告檢查",
    purpose: "追蹤內業成果的品管、期程、送出與業主回饋，找出已完成未送出、已送出未登記等斷點。",
    sources: ["v4-internal-work", "report-delivery"],
    mustHave: ["期程 N+123", "內業品管檢核後數據", "完成／品管通過／送出／業主核定分開"],
    pending: ["N 起點、+1／+2／+3 節點、日曆日或工作日、重送規則（D-05）"],
  },
  {
    id: "R04",
    slug: "r04",
    name: "人事數據",
    purpose: "讓授權主管掌握招聘、出勤、出差與加班的營運狀態與待處理事項。",
    sources: ["hr", "salary-overtime"],
    mustHave: ["招聘（暫無）", "出勤紀錄", "出差紀錄", "加班紀錄"],
    pending: ["出勤、出差需開通 Lark 假勤／審批 API 權限", "可見範圍與敏感欄位（D-09）", "加班時數是成本單層級，非每人實際時數"],
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
    purpose: "掌握儀器／車輛可用狀態、月租儀器與車輛是否有檢查，以及 TAF 與自校驗是否到期。",
    sources: ["equipment-system", "equipment-rates", "equipment-vehicles", "equipment-bookings", "equipment-returns", "equipment-inspection", "equipment-calibration", "v3-equipment", "v4-equipment", "v4-vehicles"],
    mustHave: ["儀器管理系統", "月租型儀器與車輛是否有檢查", "TAF 與自校驗檢核紀錄"],
    pending: ["資產範圍與同物異名去重（儀器總表與資料表兩份清單不去重）", "借出未歸還：預約單與歸還單沒有明確對應鍵，待定義", "停用／送修及保養日曆定義"],
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
    sources: ["v3-schedule", "v3-internal-work", "v3-internal-cost", "v4-schedule", "v4-internal-work", "v4-internal-cost"],
    mustHave: ["預排達成率（以工程編號為主）", "進行中工作營業額剩餘"],
    pending: ["達成率粒度、基準版本、改排及例外（D-03）", "剩餘點數與內外業分攤（D-06）"],
  },
  {
    id: "R10",
    slug: "r10",
    name: "外業報告",
    purpose: "外業部門看工程編號層級的預排執行差異與所有進行中工作餘量。",
    sources: ["v3-field-work", "v3-schedule", "v4-field-work", "v4-schedule"],
    mustHave: ["預排達成率（以工程編號為主）", "進行中工作營業額剩餘"],
    pending: ["外業分母粒度、延期、停工、委外規則（D-03）", "剩餘點數避免內外業重疊（D-06）"],
  },
  {
    id: "R11",
    slug: "r11",
    name: "行政數據",
    purpose: "看行政人員上週的工作單、出勤天數、營業額點數與預排差異，一人一列。",
    sources: ["v3-admin-work", "v3-admin-cost", "v4-admin-work", "v4-admin-cost", "v3-schedule", "v4-schedule"],
    mustHave: ["每人工作單張數", "出勤天數（成本單去重日期）", "營業額點數", "預排點數與差異（業別＝行政，人員＋日期比對）", "異常張數", "加班時數"],
    pending: ["失誤率／已檢核／不通過（行政沒有檢核欄，待定義）", "預排「預估營業額點數」目前全未填，暫以每人每天 1 點計", "預排條有填點數且多人時，是否各自全額或平分（暫各自全額）"],
  },
];

export const reportBySlug = (slug: string) => REPORTS.find((r) => r.slug === slug);
