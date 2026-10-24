// 永祥儀器管理 #43 (v2.1.0 Lark-as-DB: YHqcbb8MHa4VdGsA0UnjajNDpgd)
// Grounded in 05_instrument_v210_lark_as_db_acceptance.md & win_ticket_43_report.md
// Strictly enforces CORR-01: ZERO hardcoded departed employee names. Offboarding alerts
// are computed dynamically at runtime by joining holder employee_id against the 92-row roster.

export interface LarkDbSyncMeta {
  baseToken: string;
  version: string;
  writesEnabled: boolean;
  checksPassed: number;
  checksTotal: number;
  tables: {
    systemOfficial: { id: string; name: string; rows: number };
    systemRequests: { id: string; name: string; rows: number };
    systemAttachments: { id: string; name: string; rows: number };
    instrumentsMaster: { id: string; name: string; activeRows: number; archivedRows: number; monthlyRows: number; dailyRows: number };
    vehicles: { id: string; name: string; activeRows: number; scrappedRows: number };
    loanDetails: { id: string; name: string; rows: number };
    returnForms: { id: string; name: string; rows: number };
    monthlyRentals: { id: string; name: string; rows: number };
    tafRecords: { id: string; name: string; rows: number };
    peopleRoster: { id: string; name: string; totalRows: number; activeRows: number; departedRows: number };
  };
}

export const LARK_DB_META: LarkDbSyncMeta = {
  baseToken: "YHqcbb8MHa4VdGsA0UnjajNDpgd",
  version: "v2.1.0",
  writesEnabled: true,
  checksPassed: 210,
  checksTotal: 210,
  tables: {
    systemOfficial: { id: "tbltQhBohOrJ1Q6l", name: "系統正式資料", rows: 105 },
    systemRequests: { id: "tblK4QwSE0CtV0Xe", name: "系統申請紀錄", rows: 43 },
    systemAttachments: { id: "tblkNAG4kOVjmMTT", name: "系統附件", rows: 25 },
    instrumentsMaster: { id: "tblHZFEypeKfWOsF", name: "- 儀器總表", activeRows: 138, archivedRows: 12, monthlyRows: 30, dailyRows: 108 },
    vehicles: { id: "tblYUUwi0MEGuLZ0", name: "車輛", activeRows: 15, scrappedRows: 1 },
    loanDetails: { id: "tbl5qdqsc4W7zYsS", name: "儀器借單明細", rows: 30 },
    returnForms: { id: "tbl2qFvPOihhe3R1", name: "儀器管理歸還單", rows: 42 },
    monthlyRentals: { id: "tblvIt8V2ZHnqAFX", name: "儀器 月租儀器", rows: 35 },
    tafRecords: { id: "tblnq7QP6Zqcp6rA", name: "儀器 TAF", rows: 9 },
    peopleRoster: { id: "tblXmhGI18fQeOOS", name: "人員名單", totalRows: 92, activeRows: 75, departedRows: 17 },
  },
};

export interface RosterEmployee {
  employeeId: string;
  displayLabel: string;
  crew: string;
  employmentStatus: "在職" | "離職";
}

// Dynamic roster representation (92 rows: 75 active, 17 departed).
// Departed rows use employeeId + crew role labels only (CORR-01: zero hardcoded departed personal names).
export const DYNAMIC_ROSTER_SAMPLE: RosterEmployee[] = [
  { employeeId: "EMP-011", displayLabel: "古恆安", crew: "地形A", employmentStatus: "在職" },
  { employeeId: "EMP-018", displayLabel: "地形B組長", crew: "地形B", employmentStatus: "在職" },
  { employeeId: "EMP-024", displayLabel: "黃全佑", crew: "地形C", employmentStatus: "在職" },
  { employeeId: "EMP-031", displayLabel: "謝孟宗", crew: "地形E", employmentStatus: "在職" },
  { employeeId: "EMP-042", displayLabel: "莊博丞", crew: "水深B", employmentStatus: "在職" },
  { employeeId: "EMP-053", displayLabel: "黃士嘉", crew: "水深C", employmentStatus: "在職" },
  { employeeId: "EMP-088", displayLabel: "離職人員 #EMP-088（原地形組）", crew: "原地形組", employmentStatus: "離職" },
  { employeeId: "EMP-091", displayLabel: "離職人員 #EMP-091（原測量組）", crew: "原測量組", employmentStatus: "離職" },
];

export interface InstrumentItem {
  id: string;
  recordId: string;
  name: string;
  category: "全站儀" | "經緯儀" | "GPS/GNSS" | "水準儀" | "測深儀" | "無人機/光達";
  rentType: "月租型" | "日租型";
  status: "可借用" | "已借出" | "逾期未還" | "校正過期鎖定" | "保養中";
  ownerCrew: string;
  holderEmployeeId?: string;
  holderLabel?: string;
  caseCode?: string;
  borrowedDate?: string;
  dueDate?: string;
  selectedUsageDates?: string[];
  legacyDateRaw?: string;
  // INV-ASSET-1 & INV-ASSET-2: Calibration & TAF
  calibrationDate: string;
  nextCalibrationDate: string;
  calibrationStatus: "有效" | "即將到期" | "校正過期";
  tafRecordId?: string;
  tafReportUrl?: string;
  tafLab?: string;
  substituteId?: string;
  // INV-ASSET-5: Monthly photo check (single photo passes)
  monthlyPhotoCount: number;
  monthlyPhotoVerified: boolean;
  locationNote: string;
}

export const INITIAL_INSTRUMENTS: InstrumentItem[] = [
  {
    id: "GPS S901",
    recordId: "recS901Overdue01",
    name: "Stonex S901 GNSS 接收儀",
    category: "GPS/GNSS",
    rentType: "日租型",
    status: "逾期未還",
    ownerCrew: "地形A 古恆安",
    holderEmployeeId: "EMP-011",
    holderLabel: "古恆安（地形A）",
    caseCode: "C115055-1",
    borrowedDate: "2026-10-19",
    dueDate: "2026-10-23",
    selectedUsageDates: ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-21"], // duplicate 10-21 to prove deduplication -> 3 days
    calibrationDate: "2026-03-15",
    nextCalibrationDate: "2027-03-14",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_S901",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_S901",
    tafLab: "TAF 認證實驗室 #0412",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "苗栗竹南案場（隨地形A車隊）",
  },
  {
    id: "TC1101(622382)",
    recordId: "recvrdAT0iRgvw",
    name: "Leica TC1101 經緯儀 (SN:622382)",
    category: "經緯儀",
    rentType: "月租型",
    status: "已借出",
    ownerCrew: "地形A 古恆安",
    holderEmployeeId: "EMP-011",
    holderLabel: "古恆安（地形A）",
    caseCode: "C115055-1",
    borrowedDate: "2026-10-01",
    dueDate: "2026-10-31",
    selectedUsageDates: ["2026-10-20", "2026-10-22", "2026-10-24"],
    calibrationDate: "2025-11-10",
    nextCalibrationDate: "2026-11-09",
    calibrationStatus: "即將到期",
    tafRecordId: "recvrSmzqZ3mHM",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recvrSmzqZ3mHM",
    tafLab: "TAF 國家度量衡標準實驗室 (證書號 TAF-622382)",
    monthlyPhotoCount: 0,
    monthlyPhotoVerified: false,
    locationNote: "台中港外業駐點（待補單張月租照）",
  },
  {
    id: "TS15P(511094)",
    recordId: "recTS15PExpired",
    name: "Leica TS15P 1\" 全站儀",
    category: "全站儀",
    rentType: "日租型",
    status: "校正過期鎖定",
    ownerCrew: "儀器室庫房（紅鎖禁派）",
    calibrationDate: "2025-09-30",
    nextCalibrationDate: "2026-09-29",
    calibrationStatus: "校正過期",
    tafRecordId: "recTAF_511094",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_511094",
    tafLab: "TAF 認證實驗室 #0198（效期已屆滿）",
    substituteId: "TS16P(651591)",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "總公司儀器室 B 區（INV-ASSET-2 校正過期硬鎖定）",
  },
  {
    id: "TS16P(651591)",
    recordId: "recTS16PValid",
    name: "Leica TS16P 自動全站儀",
    category: "全站儀",
    rentType: "日租型",
    status: "可借用",
    ownerCrew: "儀器室庫房（可立即領用）",
    calibrationDate: "2026-05-12",
    nextCalibrationDate: "2027-05-11",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_651591",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_651591",
    tafLab: "TAF 認證實驗室 #0412",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "總公司儀器室 A1 櫃（建議替代 TS15P）",
  },
  {
    id: "DNA03(341088)",
    recordId: "recDNA03Offboard",
    name: "Leica DNA03 電子水準儀",
    category: "水準儀",
    rentType: "月租型",
    status: "逾期未還",
    ownerCrew: "原地形組（離職待追回）",
    holderEmployeeId: "EMP-088",
    holderLabel: "離職人員 #EMP-088",
    caseCode: "C114089-2",
    borrowedDate: "2026-08-15",
    dueDate: "2026-09-15",
    selectedUsageDates: ["2026-08-15", "2026-08-18"],
    legacyDateRaw: "08/15, 08/18 (缺年份)",
    calibrationDate: "2026-02-01",
    nextCalibrationDate: "2027-01-31",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_DNA03",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_DNA03",
    tafLab: "TAF 認證實驗室 #0412",
    monthlyPhotoCount: 0,
    monthlyPhotoVerified: false,
    locationNote: "INV-ASSET-5 動態攔截：持有人在職狀態=離職",
  },
  {
    id: "GS18T(782190)",
    recordId: "recGS18TCrewC",
    name: "Leica GS18T 傾斜補償 RTK",
    category: "GPS/GNSS",
    rentType: "月租型",
    status: "已借出",
    ownerCrew: "地形C 黃全佑",
    holderEmployeeId: "EMP-024",
    holderLabel: "黃全佑（地形C）",
    caseCode: "C115062-1",
    borrowedDate: "2026-10-01",
    dueDate: "2026-10-31",
    selectedUsageDates: ["2026-10-14", "2026-10-15", "2026-10-21", "2026-10-24"],
    calibrationDate: "2026-04-10",
    nextCalibrationDate: "2027-04-09",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_GS18T",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_GS18T",
    tafLab: "TAF 認證實驗室 #0412",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "彰化鹿港案場（月租單張照已檢核通過）",
  },
  {
    id: "LS15(903412)",
    recordId: "recLS15CrewE",
    name: "Leica LS15 數位水準儀",
    category: "水準儀",
    rentType: "月租型",
    status: "已借出",
    ownerCrew: "地形E 謝孟宗",
    holderEmployeeId: "EMP-031",
    holderLabel: "謝孟宗（地形E）",
    caseCode: "C115071-1",
    borrowedDate: "2026-10-01",
    dueDate: "2026-10-31",
    selectedUsageDates: ["2026-10-18", "2026-10-19", "2026-10-22"],
    calibrationDate: "2026-06-20",
    nextCalibrationDate: "2027-06-19",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_LS15",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_LS15",
    tafLab: "TAF 認證實驗室 #0412",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "雲林麥寮測區",
  },
  {
    id: "Echotrac E20",
    recordId: "recEchoBathB",
    name: "Teledyne Odom Echotrac E20 雙頻測深儀",
    category: "測深儀",
    rentType: "日租型",
    status: "已借出",
    ownerCrew: "水深B 莊博丞",
    holderEmployeeId: "EMP-042",
    holderLabel: "莊博丞（水深B）",
    caseCode: "C115080-1",
    borrowedDate: "2026-10-22",
    dueDate: "2026-10-27",
    selectedUsageDates: ["2026-10-22", "2026-10-23", "2026-10-24"],
    calibrationDate: "2026-07-01",
    nextCalibrationDate: "2027-06-30",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_E20",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_E20",
    tafLab: "海洋測繪檢校中心",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "高雄興達港測量船",
  },
  {
    id: "AquaMap R2",
    recordId: "recAquaBathC",
    name: "無人測量船多音束聲納系統",
    category: "測深儀",
    rentType: "日租型",
    status: "已借出",
    ownerCrew: "水深C 黃士嘉",
    holderEmployeeId: "EMP-053",
    holderLabel: "黃士嘉（水深C）",
    caseCode: "C115083-1",
    borrowedDate: "2026-10-23",
    dueDate: "2026-10-28",
    selectedUsageDates: ["2026-10-23", "2026-10-24"],
    calibrationDate: "2026-08-12",
    nextCalibrationDate: "2027-08-11",
    calibrationStatus: "有效",
    tafRecordId: "recTAF_R2",
    tafReportUrl: "https://yong-xiang-survey.jp.larksuite.com/base/YHqcbb8MHa4VdGsA0UnjajNDpgd?table=tblnq7QP6Zqcp6rA&record=recTAF_R2",
    tafLab: "海洋測繪檢校中心",
    monthlyPhotoCount: 1,
    monthlyPhotoVerified: true,
    locationNote: "台南安平港作業區",
  },
];

export interface CrewRadarNode {
  crewName: string;
  leader: string;
  caseCode: string;
  siteLocation: string;
  vehiclePlate: string;
  vehicleSharedWith?: string;
  vehicleInsuranceDue: string;
  vehicleMaintDue: string;
  vehicleAlert?: string;
  heldInstruments: {
    id: string;
    category: string;
    rentType: "月租型" | "日租型";
    tafStatus: "有效" | "即將到期" | "校正過期";
    overdue?: boolean;
    photoVerified: boolean;
  }[];
}

export const CREW_RADAR_DATA: CrewRadarNode[] = [
  {
    crewName: "地形A 古恆安",
    leader: "古恆安",
    caseCode: "C115055-1",
    siteLocation: "苗栗竹南離岸風電陸域段",
    vehiclePlate: "ABC-1234",
    vehicleSharedWith: "地形B（明日 10/26 08:00-17:00 預排衝突）",
    vehicleInsuranceDue: "2027-02-15",
    vehicleMaintDue: "2026-11-05（剩 11 天）",
    vehicleAlert: "INV-ASSET-4: 明日與地形B同車重疊 (GiST period &&)",
    heldInstruments: [
      { id: "GPS S901", category: "GPS/GNSS", rentType: "日租型", tafStatus: "有效", overdue: true, photoVerified: true },
      { id: "TC1101(622382)", category: "經緯儀", rentType: "月租型", tafStatus: "即將到期", overdue: false, photoVerified: false },
    ],
  },
  {
    crewName: "地形B",
    leader: "地形B組長",
    caseCode: "C115055-2",
    siteLocation: "苗栗後龍控制點加密區",
    vehiclePlate: "ABC-1234",
    vehicleSharedWith: "地形A 古恆安",
    vehicleInsuranceDue: "2027-02-15",
    vehicleMaintDue: "2026-11-05（剩 11 天）",
    vehicleAlert: "INV-ASSET-4: 明日已排 ABC-1234（建議改派 DEF-5678 或共乘）",
    heldInstruments: [
      { id: "TS16-B02(619201)", category: "全站儀", rentType: "月租型", tafStatus: "有效", overdue: false, photoVerified: true },
      { id: "GS18-B01(771029)", category: "GPS/GNSS", rentType: "月租型", tafStatus: "有效", overdue: false, photoVerified: true },
    ],
  },
  {
    crewName: "地形C 黃全佑",
    leader: "黃全佑",
    caseCode: "C115062-1",
    siteLocation: "彰化鹿港排水幹線地形測量",
    vehiclePlate: "BLW-9012",
    vehicleInsuranceDue: "2026-11-02（剩 8 天 ⚠）",
    vehicleMaintDue: "2027-01-20",
    vehicleAlert: "INV-ASSET-1: 車輛保險 8 天內到期預警",
    heldInstruments: [
      { id: "GS18T(782190)", category: "GPS/GNSS", rentType: "月租型", tafStatus: "有效", overdue: false, photoVerified: true },
      { id: "TS15-C01(589310)", category: "全站儀", rentType: "月租型", tafStatus: "有效", overdue: false, photoVerified: true },
    ],
  },
  {
    crewName: "地形E 謝孟宗",
    leader: "謝孟宗",
    caseCode: "C115071-1",
    siteLocation: "雲林麥寮工業區管線收測",
    vehiclePlate: "KPD-3318",
    vehicleInsuranceDue: "2027-05-18",
    vehicleMaintDue: "2026-12-10",
    heldInstruments: [
      { id: "LS15(903412)", category: "水準儀", rentType: "月租型", tafStatus: "有效", overdue: false, photoVerified: true },
      { id: "GS16-E02(710492)", category: "GPS/GNSS", rentType: "日租型", tafStatus: "有效", overdue: false, photoVerified: true },
    ],
  },
  {
    crewName: "水深B 莊博丞",
    leader: "莊博丞",
    caseCode: "C115080-1",
    siteLocation: "高雄興達港航道水深監測",
    vehiclePlate: "MDB-6621",
    vehicleInsuranceDue: "2027-04-01",
    vehicleMaintDue: "2026-11-28",
    heldInstruments: [
      { id: "Echotrac E20", category: "測深儀", rentType: "日租型", tafStatus: "有效", overdue: false, photoVerified: true },
      { id: "RTK-W02(802311)", category: "GPS/GNSS", rentType: "日租型", tafStatus: "有效", overdue: false, photoVerified: true },
    ],
  },
  {
    crewName: "水深C 黃士嘉",
    leader: "黃士嘉",
    caseCode: "C115083-1",
    siteLocation: "台南安平港外海淤積調查",
    vehiclePlate: "TQA-7780",
    vehicleInsuranceDue: "2027-06-12",
    vehicleMaintDue: "2027-02-14",
    heldInstruments: [
      { id: "AquaMap R2", category: "測深儀", rentType: "日租型", tafStatus: "有效", overdue: false, photoVerified: true },
      { id: "RTK-W05(809122)", category: "GPS/GNSS", rentType: "日租型", tafStatus: "有效", overdue: false, photoVerified: true },
    ],
  },
];

// Helper: compute deduplicated usage days without filling gaps (fldjH7l0vd)
export function computeDeduplicatedUsageDays(dates: string[]): { uniqueSorted: string[]; count: number } {
  const uniqueSorted = Array.from(new Set(dates.filter(Boolean))).sort();
  return { uniqueSorted, count: uniqueSorted.length };
}

// Helper: dynamically detect offboarded holders by joining against roster (INV-ASSET-5, CORR-01)
export function findDynamicOffboardedAssets(
  instruments: InstrumentItem[],
  roster: RosterEmployee[] = DYNAMIC_ROSTER_SAMPLE
): Array<{ instrument: InstrumentItem; employee: RosterEmployee }> {
  const departedById = new Map(
    roster.filter((r) => r.employmentStatus === "離職").map((r) => [r.employeeId, r])
  );
  const alerts: Array<{ instrument: InstrumentItem; employee: RosterEmployee }> = [];
  for (const inst of instruments) {
    if (inst.holderEmployeeId && departedById.has(inst.holderEmployeeId)) {
      alerts.push({ instrument: inst, employee: departedById.get(inst.holderEmployeeId)! });
    }
  }
  return alerts;
}
