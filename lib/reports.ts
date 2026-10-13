// Report and data-source registry, based on the PM handover spec (R01–R10, S1–S11).
// Base / table / view IDs are identifiers, not secrets: access is granted by the
// Lark app credentials in the server environment.

export type DataVersion = "v3" | "v4";

export interface SourceDef {
  optional?: boolean; // reference only: no report depends on it, so a failure is not a report outage
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

// 薪水計算 Base 的「詠翔加班」（逐筆加班審批單）：只讀下列欄位，精確比對、不用關鍵字。
// 金額、薪資、身分、帳號、電話、地址、事由、明細等欄一律不向 Lark 要求。
// 「發起人」（繁體「發」，人員欄）＝這張加班單算誰的；「加班人」只當備援（發起人空白才用，真實資料全空）。
// 簡體的「发起人部门」「当前处理人」不讀：組別改依 V3 人員名單的所屬組別（公司組織架構），部門欄不要了。
// 「薪資計算加班時數」名稱含薪資，但它是時數公式（原始加班時數＋人工補正），不是金額。
// 欄名與 lib/overtime.ts 的常數一致（scripts/test-hr-overtime.mjs 會檢查）。
const SALARY_ALLOW = ["發起人", "加班人", "开始时间", "加班类型", "申请状态", "薪資計算加班時數", "加班时长（小时）"];
export const salaryField = (name: string) => SALARY_ALLOW.includes(name);

// 報價 Base「報價總表」：只讀下列 33 欄（業主 2026-10-13 裁示），精確比對。
// 契約價格（未稅／含稅）、毛利、確認單成本、預算、可請款、實收營業額、紅利等金額欄一律不向 Lark 要求。
const QUOTES_ALLOW = [
  "案件編號", "編號", "工程編號", "案件名稱", "工程名稱", "報價編號", "案件狀態", "狀態", "類型", "業主", "業主類型",
  "詢價日期", "報價日期", "報價期限", "回傳單日期", "確認單回傳開會日期", "外業期限", "內業期限(圖)", "內業期限(控)", "內業期限(報)",
  "確認單到期日", "合約開始日期", "合約結束日期", "外業確認單營業額", "控制確認單營業額", "圖資確認單營業額", "報告確認單營業額", "行政確認單營業額",
  "PM", "案件負責人", "報價負責人", "外業負責組別", "內業負責組別",
];
export const quotesField = (name: string) => QUOTES_ALLOW.includes(name);

// V3「人員名單」：R04 加班只拿來把發起人（備援：加班人）對到所屬組別，所以只讀這四欄，精確比對。
// 電話、身分、帳戶、薪資、職級、備註、各種成本單連結、OpenID 同步欄一律不向 Lark 要求。
// 欄名與 lib/people.ts 的常數一致（scripts/test-hr-overtime.mjs 會檢查）。
const PEOPLE_ALLOW = ["姓名", "Lark帳號", "所屬組別", "在職"];
export const peopleField = (name: string) => PEOPLE_ALLOW.includes(name);

const V3 = "Sdw1bG1djaHsVGsRPvmjyVWipgg"; // 詠翔日報系統 v3
const V4 = "H7W6b0PFWaVF1BsgqXJj3pQ9pXb"; // 詠翔日報系統 V4
const SALES_BASE = "JoOqbggsVar0ATsVgbcjh6IIp1g";
const SALARY_BASE = "VwAsbezz9app3YsramgjduLYp2U"; // 薪水計算 Base
const LARK_WEB = "https://yong-xiang-survey.jp.larksuite.com";

// V4 inclusion baseline (PM decision 2026-10-13): V4 counts only from 2026-10-13
// 00:00 Asia/Taipei — rows filled in from today on. Everything created earlier
// (tests and trial entries) and rows without a creation time are excluded.
const V4_BASELINE = Date.UTC(2026, 9, 12, 16, 0, 0, 0);
const V4_RULE = { createdAfter: V4_BASELINE, createdAfterLabel: "2026-10-13 00:00（台北）" };

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

// 儀器管理系統 Base（22 張表）：PM週報 應用目前落在內建 Reader 角色，只讀得到 5 張表（資料表、儀器總表、車輛、預約申請單、歸還單）；
// 其餘表（日租、月租、借單明細、維護履歷×2、TAF，以及維護履歷的關聯選項表）要等「PM週報唯讀」角色開放，沒開放前讀取會失敗，頁面會顯示原因。
const EQUIP_BASE = "YHqcbb8MHa4VdGsA0UnjajNDpgd";
// 預約單／歸還單不讀申請人、處理人等人員欄位。
const BOOKING_FIELD = (name: string) => !/发起人|当前处理人|审批节点|审批流程/.test(name);
// 其餘儀器表用白名單：只讀口徑需要的欄位，不讀申請人、價格、附件、備註。
const only = (names: string[]) => (name: string) => names.includes(name);
function eqSys(key: string, name: string, table: string, note: string, extra: Partial<SourceDef> = {}): SourceDef {
  return { key, name, baseToken: EQUIP_BASE, tableId: table, url: tableUrl(EQUIP_BASE, table), note, ...extra };
}

export const SOURCES: SourceDef[] = [
  raw("v3-field-work", "外業工作單", "v3", "tbl97f1uXqi7Qz0k", { dateField: "出工日期", columns: COLS.fieldWork, ...DASH.fieldWork, note: "R01 與 R10 共用同一批工作單，跨報告不可相加。" }),
  raw("v4-field-work", "外業工作單", "v4", "tbl5zPLS0ExWNEty", { dateField: "工作日期-薪資", columns: COLS.fieldWork, ...DASH.fieldWork, note: "R01 與 R10 共用；欄名含「最終」不代表已核定。" }),
  raw("v4-field-cost", "外業成本單", "v4", "tbl8wRYCUCvbSoJG", { dateField: "工作日期", columns: COLS.fieldCost, ...DASH.fieldCost }),
  raw("v3-field-cost", "外業成本單", "v3", "tblQCy3eU0wsUj1I", { dateField: "工作日期", columns: COLS.fieldCost, ...DASH.fieldCost, note: "R01 用來判定一組拆成多組出工（同組同日組長不同）。" }),
  // 週篩選依「工作日期-營業額明細」（與成本單工作日期一致）；預設的「填報時間」是填單當下時間，會漏掉補填的單（上週 84 張而非 96 張）。
  raw("v3-internal-work", "內業工作單", "v3", "tblTP5Naz52FBpFg", { dateField: "工作日期-營業額明細", columns: COLS.internalWork, ...DASH.internalWork, note: "R02 與 R09 共用；「最終營業額點數」欄名含「最終」不代表已核定。" }),
  raw("v4-internal-work", "內業工作單", "v4", "tblrCo8KeZiuJUNh", { columns: COLS.internalWork, ...DASH.internalWork, note: "R02、R03、R09 共用；含品管檢核、業主數量覆寫欄位。" }),
  raw("v3-internal-cost", "內業成本單", "v3", "tbl8JdWLLwlPFuoF", { dateField: "工作日期", columns: COLS.internalCost, ...DASH.internalCost }),
  raw("v4-internal-cost", "內業成本單", "v4", "tblKwSDRg6WaGHYr", { dateField: "工作日期", columns: COLS.internalCost, ...DASH.internalCost }),
  raw("v3-schedule", "工作預排", "v3", "tblN8c3WN44233aG", { columns: COLS.schedule, ...DASH.schedule }),
  raw("v3-people", "人員名單（組織架構）", "v3", "tblmlpA6nG5Ou7NQ", {
    allowField: peopleField,
    restricted: "hr",
    note: "R04 加班用它把發起人（備援：加班人）對到「所屬組別」（公司組織架構）；只讀姓名、Lark帳號、所屬組別、在職，其他欄位一律不讀。依 HR_VIEWERS 設定才看得到。",
  }),
  raw("v4-schedule", "工作預排", "v4", "tblZz6Mkhv9gHrB2", { dateField: "開始日期", columns: COLS.schedule, ...DASH.schedule }),
  // R09 內業報告用：案件編號（主欄）與案件名稱。整張表讀進伺服器，頁面只投影這兩欄（請款、成本等欄位不外送）；V4 沒有對應表。
  raw("v3-cases", "案件", "v3", "tblWsSaOcy4nKuGI", { columns: ["案件編號", "案件名稱", "業主", "狀態"], note: "R09／R10 取案件編號與案件名稱（工程名稱）；預排與工作單的案件以 record_id 比對，不可用編號文字（有編號重複與全 0 占位碼）。與「案件應收未收」同一張表，不套視圖篩選。" }),
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
    allowField: quotesField,
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
    name: "薪水計算：詠翔加班",
    baseToken: SALARY_BASE,
    tableId: "tblomH0DXCzXgenE",
    allowField: (n) => salaryField(n),
    restricted: "hr",
    url: tableUrl(SALARY_BASE, "tblomH0DXCzXgenE"),
    note: "逐筆加班審批單；只讀發起人（加班人為備援）、開始時間、加班類型、申請狀態、加班時數，只計「已通过」；組別依 V3 人員名單。金額、薪資、身分等欄一律不讀。需 PM週報 在該 Base 有唯讀角色。依 HR_VIEWERS 設定才看得到。",
  },
  // R07: 儀器管理系統 Base（業主 2026-10-13 提供）。與 V3／V4 的儀器費率、車輛分開，不相加、不去重。
  eqSys("equipment-system", "儀器管理系統：儀器總表（正式清單）", "tblHZFEypeKfWOsF", "正式儀器清單（業主同事 2026-10-13 確認），編號＝「ID」欄。借用狀態（可借用／已借出）、rent_type 月租型／日租型、系統封存＝已下架。只讀 ID、設備、設備類別、rent_type、owner_group、狀態、系統封存（不讀價格、購入成本）。", {
    allowField: only(["ID", "設備", "設備類別", "rent_type", "owner_group", "狀態", "系統封存"]),
  }),
  eqSys("equipment-daily", "儀器管理系統：日租儀器（狀態）", "tbl4DLVKuXf4yaEy", "可借用／異常／保養中 的狀態來源（日租）。136 列中 106 列是空白占位列（無 ID、無狀態），不算。以 ID 對儀器總表。需 PM週報唯讀角色開放此表。", {
    allowField: only(["ID", "狀態", "rent_type", "設備類別"]),
  }),
  eqSys("equipment-monthly", "儀器管理系統：月租儀器（狀態）", "tblvIt8V2ZHnqAFX", "可借用／異常／保養中 的狀態來源（月租）。以 ID 對儀器總表。不使用「(測試)儀器 月租儀器 副本」。需 PM週報唯讀角色開放此表。", {
    allowField: only(["ID", "狀態", "rent_type", "設備類別"]),
  }),
  eqSys("equipment-vehicles", "儀器管理系統：車輛", "tblYUUwi0MEGuLZ0", "保養到期、保險到期取自本表；與 V4 車輛主檔分開，不相加。", { columns: ["車牌", "狀態", "current_mileage", "next_maintenance", "insurance_date", "insurance_company", "maintenance_company"] }),
  eqSys("equipment-bookings", "儀器管理系統：儀器預約申請單", "tblVLETpvLxMNwaC", "借出以「已通过」且借出日期落在所選週計；已撤回另計。不讀申請人、處理人欄位。", { allowField: BOOKING_FIELD, dateField: "借出日期" }),
  eqSys("equipment-returns", "儀器管理系統：儀器管理歸還單", "tbl2qFvPOihhe3R1", "歸還以「已通过」且歸還日期落在所選週計；已撤回另計。借出未歸還用「借出儀器/車輛」比對（該欄值前面帶申請人姓名，只用於比對、頁面不顯示）。不讀申請人、處理人欄位。", {
    allowField: only(["申请状态", "借出儀器/車輛", "歸還日期", "設備類別1", "申请编号"]),
    dateField: "歸還日期",
  }),
  eqSys("equipment-loans", "儀器管理系統：儀器借單明細", "tbl5qdqsc4W7zYsS", "借出未歸還的來源：識別欄為 借出儀器/車輛、日租ID、月租ID、車牌（依序取第一個有值）。不讀發起人。需 PM週報唯讀角色開放此表。", {
    allowField: only(["借出儀器/車輛", "日租ID", "月租ID", "車牌", "借出日期", "預計歸還日期", "所屬組別", "設備類別", "是否已歸還"]),
  }),
  eqSys("equipment-maintenance", "儀器管理系統：儀器 維護履歷", "tblDaO9z94PSjuVq", "維修／保養日期、費用、廠家；與儀器的關聯是人工選「設備類別」(link→「- 儀器維護相關 選項」)。需 PM週報唯讀角色開放此表與其關聯選項表。", {
    allowField: only(["設備類別", "維修/保養日期", "費用", "維修/保養廠家", "備註"]),
  }),
  eqSys("equipment-taf", "儀器管理系統：儀器 TAF", "tblnq7QP6Zqcp6rA", "TAF 紀錄（業主同事 2026-10-13 確認）；欄位只有 TAF日期、TAF文件、備註與關聯儀器，沒有有效期限欄。需 PM週報唯讀角色開放此表與其關聯選項表。", {
    allowField: only(["設備類別", "TAF日期", "備註"]),
  }),
  eqSys("equipment-vehicle-maintenance", "儀器管理系統：車輛 維護履歷", "tbl2PlmDyO1ciy2E", "車輛維修／保養日期、費用、廠家；與車輛的關聯是人工選「車牌」(link→「- 車輛維護相關 選項」)。需 PM週報唯讀角色開放此表與其關聯選項表。", {
    allowField: only(["車牌", "維修/保養日期", "費用", "維修/保養廠家", "備註"]),
  }),
  // 「資料表」：業主同事說是某位同事自己拉的、來源不明，不再當主要來源；R07 主畫面不顯示，只留在「查看原始資料表」。
  eqSys("equipment-rates", "儀器管理系統：資料表（非正式、來源不明）", "tblZmvrjDC5Q3sIp", "非正式、來源不明（某同事自己拉的）；R07 主畫面不使用，只供查看原始資料。含日租金、啟用、狀態。", { optional: true }),
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
    sources: ["hr", "salary-overtime", "v3-people"],
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
    purpose: "掌握儀器／車輛可用狀態（可借用／異常／保養中）、借出未歸還，以及維護履歷與 TAF 紀錄。",
    sources: ["equipment-system", "equipment-daily", "equipment-monthly", "equipment-vehicles", "equipment-bookings", "equipment-returns", "equipment-loans", "equipment-maintenance", "equipment-taf", "equipment-vehicle-maintenance", "v3-equipment", "v4-equipment", "v4-vehicles", "equipment-rates"],
    mustHave: ["儀器清單（儀器總表＋日租／月租狀態）", "借出未歸還", "維護履歷（儀器、車輛）與 TAF 紀錄", "車輛保養與保險提醒"],
    pending: ["檢查頻率（每週／每月）與「是否有檢查」合格率：業主未定義，只列紀錄", "TAF 有效期限：「儀器 TAF」沒有有效期限欄，先不判到期", "維護履歷／TAF 與儀器的關聯是人工選的，沒選的列不歸屬儀器"],
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
    purpose: "內業經理看上週預排與實際完成的對照：誰排了沒填、誰沒排卻填了，哪些案件排了沒做，以及要人工確認的異常單。",
    sources: ["v3-schedule", "v3-internal-work", "v3-internal-cost", "v4-schedule", "v4-internal-work", "v4-internal-cost"],
    mustHave: ["預排 vs 實際（人日，內業以人為單位，人員＋日期比對）", "預排 vs 實際（案件）", "上週異常與人工確認案件（未排有填、有排未填、⚠亮燈、已退回）", "進行中工作營業額剩餘"],
    pending: [
      "圖資／報告節點的期限（n+2、N+2、N+1）、節點狀態（未逾期／預計逾期／已逾期／無工作）、確認單營業額與執行比例：口徑待業主說明（確認單營業額來源為工程確認單，目前 V4／報價 Base 尚未開放讀取）",
      "工程編號是否取案件編號前 7 碼：業主未回覆，先以案件記錄為單位",
      "剩餘點數與內外業分攤（D-06）",
    ],
  },
  {
    id: "R10",
    slug: "r10",
    name: "外業報告",
    purpose: "外業經理看上週預排與實際完成的對照（以案件為單位）、異常與人工確認案件、檢核待辦，判斷預排是否失誤。",
    sources: ["v3-field-work", "v3-schedule", "v3-cases", "v4-field-work", "v4-schedule"],
    mustHave: ["預排 vs 實際（案件編號＋工程名稱）：預排組日、實際出工組日、吻合組日、結果分類", "異常與人工確認案件（未排有做、有排未做、突發狀況、已退回、修改後數量≠完成數量）", "檢核待辦（外業經理檢核未勾、控制組檢核未勾、已退回）"],
    pending: ["圖資／報告節點期限（N+1／N+2）與節點狀態（未逾期／預計逾期／已逾期／無工作）口徑待業主說明", "工程編號是否合併成案件編號前 7 碼（目前以案件記錄為單位）", "進行中工作營業額剩餘：外業分母粒度、延期、停工、委外規則（D-03）與避免內外業重疊（D-06）"],
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
