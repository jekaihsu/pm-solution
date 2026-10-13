// 公司組織架構＝V3 日報系統的「人員名單」（tblmlpA6nG5Ou7NQ）。R04 加班用它把「加班人」對到「所屬組別」。
// 純函式、不 import 其他 lib 的值（node --test 可直接載入）。
// 只讀四個欄位：姓名、Lark帳號（人員欄，含 open_id）、所屬組別、在職。電話、身分、帳戶、薪資等一律不讀
// （reports.ts 的 peopleField 白名單；兩邊欄名由 scripts/test-hr-overtime.mjs 檢查一致）。

export const PEOPLE_NAME = "姓名";
export const PEOPLE_ACCOUNT = "Lark帳號";
export const PEOPLE_GROUP = "所屬組別";
export const PEOPLE_ACTIVE = "在職";

// Lark 人員欄的一個人：id 是 open_id（同一個 PM週報 應用底下，登入的 open_id 與這裡相同）。
export interface PersonRef {
  id: string; // 缺 open_id 時為 ""
  name: string;
}

// 把 Lark 回傳的人員欄原始值 [{ id, name, en_name, email }] 轉成 {id, name}（不留 email 等其他資料）。
// 順序與 name 的算法和 normalizeValue 的 person 分支一致，所以和該欄的名字陣列逐項對齊。
// 一個 open_id 都沒有就回 null（沒東西可留）。
export function personRefs(raw: unknown): PersonRef[] | null {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const refs = list.map((p): PersonRef => {
    if (p && typeof p === "object") {
      const o = p as { id?: unknown; name?: unknown; en_name?: unknown };
      return { id: typeof o.id === "string" ? o.id : "", name: String(o.name ?? o.en_name ?? "") };
    }
    return { id: "", name: String(p ?? "") };
  });
  return refs.some((r) => r.id) ? refs : null;
}

type Cell = string | number | boolean | null | undefined | (string | number)[];
export interface PeopleRow {
  id: string;
  fields: Record<string, Cell>;
  people?: Record<string, PersonRef[]>; // 人員欄的 open_id（API 帶 people=1 才有）
}

export interface PeopleDirectory {
  // 這群人（一張加班單的加班人，通常 1 位）屬於哪個組別；對不到、組別不一致、無法判斷時回 null。
  groupFor(persons: { id?: string; name: string }[]): string | null;
}

const text = (v: Cell) => (v === null || v === undefined ? "" : Array.isArray(v) ? v.join("、") : String(v)).trim();

interface Cand {
  group: string;
  active: boolean;
}

// 同一個 key 對到多列時：有在職的就只看在職的；剩下的組別恰好一種才採用，否則不猜。
function pick(cands: Cand[] | undefined): string | null {
  if (!cands?.length) return null;
  const live = cands.filter((c) => c.active);
  const groups = new Set((live.length ? live : cands).map((c) => c.group));
  return groups.size === 1 ? [...groups][0] : null;
}

export function buildPeopleDirectory(rows: PeopleRow[]): PeopleDirectory {
  const byId = new Map<string, Cand[]>(); // open_id → 候選
  const byName = new Map<string, Cand[]>(); // 姓名（完全相同）→ 候選
  const add = (m: Map<string, Cand[]>, key: string, c: Cand) => m.set(key, [...(m.get(key) ?? []), c]);
  for (const r of rows) {
    const group = text(r.fields[PEOPLE_GROUP]);
    if (!group) continue; // 名單上沒填所屬組別的人，不能拿來決定組別
    const cand = { group, active: r.fields[PEOPLE_ACTIVE] === true };
    for (const p of r.people?.[PEOPLE_ACCOUNT] ?? []) if (p.id) add(byId, p.id, cand);
    const name = text(r.fields[PEOPLE_NAME]);
    if (name) add(byName, name, cand);
  }
  return {
    groupFor(persons) {
      if (!persons.length) return null;
      const groups = persons.map((p) => (p.id ? pick(byId.get(p.id)) : null) ?? pick(byName.get(p.name.trim())));
      if (groups.some((g) => g === null)) return null;
      return new Set(groups).size === 1 ? groups[0] : null;
    },
  };
}
