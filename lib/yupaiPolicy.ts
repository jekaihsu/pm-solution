// JK 2026-10-20：唯一的具名豁免政策；預排與日誌皆免，打卡仍獨立檢核。
export const EXEMPT_NAMES = ["許茂坤", "鄭光瑞", "William Chiu", "許喆凱", "林育寬"] as const;
export const EXEMPT_REASON = "JK 確認免填預排";
export const DEPARTED_NAMES = ["陳星穎"] as const;
export const POLICY_VERSION = "jk-2026-10-20-sources-v2";

export const GROUP_OVERRIDES: Record<string, string> = { 林豐緯: "水深C", 蔡長庭: "水深C", 陳靖羽: "地形C" };
export const SOURCE_PENDING_NAMES = new Set(["劉芳君", "彭書逸", "徐孟君"]);

// 僅處理已知簡繁／異體與別名，不模糊比對，也不移除英文姓名間的空白。
export function normalizeName(name: string): string {
  const chars: Record<string, string> = { 郑: "鄭", 许: "許", 凯: "凱", 宽: "寬" };
  const value = name.normalize("NFKC").trim().replace(/[郑许凯宽]/g, (c) => chars[c]);
  const aliases: Record<string, string> = { 鄭光睿: "鄭光瑞", 鄭秉彝: "鄭秉彜" };
  return aliases[value] ?? value;
}

const exempt = new Set<string>(EXEMPT_NAMES.map(normalizeName));
const departed = new Set<string>(DEPARTED_NAMES.map(normalizeName));

export interface PersonPolicy {
  rawName: string;
  name: string;
  classification: "外業" | "業務" | "內業";
  requiresPlanning: boolean;
  requiresLog: boolean;
  exemptionReason: string | null;
  departedReason: string | null;
  dataAttentionReasons: string[];
}

export function classifyPerson(rawName: string, group: string): PersonPolicy {
  const name = normalizeName(rawName);
  const groupName = group.normalize("NFKC").trim();
  const departedReason = departed.has(name) ? "離職" : null;
  const exemptionReason = !departedReason && exempt.has(name) ? EXEMPT_REASON : null;
  const required = !departedReason && !exemptionReason;
  return {
    rawName,
    name,
    // 非三大組（含 PM／行政／IT／控制／圖報及未填組別）按內業檢核，原組別另保留。
    classification: groupName === "業務" ? "業務" : /水深|地形|點工|ROV|外業|奇穎/.test(groupName) ? "外業" : "內業",
    requiresPlanning: required,
    requiresLog: required,
    exemptionReason,
    departedReason,
    dataAttentionReasons: [!name ? "人員名單未填姓名" : "", !groupName || groupName === "（未填組別）" ? "人員名單未填組別" : ""].filter(Boolean),
  };
}
