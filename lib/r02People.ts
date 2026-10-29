import type { TableData } from "./types";
import { sumRows, type GroupRow } from "./controlGroup";

// Section 1 is a current roster view. A historical cost-sheet team is not a
// reliable current assignment; unresolved identities are excluded rather than guessed.
export function currentRosterRows(rows: GroupRow[], roster: TableData["records"]): { rows: GroupRow[]; excluded: number } {
  const active = roster.filter(r => r.fields["在職"] === true);
  const byId = new Map(active.map(r => [r.id, r]));
  const byName = new Map<string, typeof active>();
  for (const r of active) {
    const n = String(r.fields["姓名"] ?? "").trim();
    if (n && !/^rec[a-z\d]+$/i.test(n)) byName.set(n, [...(byName.get(n) ?? []), r]);
  }
  // Merge duplicate active records only when name and team agree and every record has the same verified Lark account. Different names never share an alias.
  const canonical = new Map<string, string>();
  for (const candidates of byName.values()) {
    const teams = new Set(candidates.map(r => String(r.fields["所屬組別"] ?? "").trim()));
    const accounts = new Set(candidates.flatMap(r => (r.people?.["Lark帳號"] ?? []).map(p => p.id).filter(Boolean)));
    if (teams.size === 1 && accounts.size === 1 && candidates.every(r => (r.people?.["Lark帳號"] ?? []).some(p => p.id))) for (const r of candidates) canonical.set(r.id, candidates[0].id);
  }
  const grouped = new Map<string, GroupRow[]>();
  let excluded = 0;
  for (const row of rows) {
    const id = row.personId ?? "";
    // A real record ID must resolve exactly; never treat it as a person's name.
    const candidates = byName.get(row.group.trim()) ?? [];
    const person = byId.get(id) ?? (!/^rec[a-z\d]+$/i.test(id) && candidates.length === 1 ? candidates[0] : undefined);
    const name = String(person?.fields["姓名"] ?? "").trim();
    if (!person || !name || /^rec[a-z\d]+$/i.test(name)) { excluded += row.orders.length; continue; }
    const key = canonical.get(person.id) ?? person.id;
    const items = grouped.get(key) ?? [];
    items.push(row); grouped.set(key, items);
  }
  const result = [...grouped.entries()].map(([id, parts]) => {
    const p = byId.get(id)!;
    const name = String(p.fields["姓名"]).trim();
    const team = String(p.fields["所屬組別"] ?? "").trim() || "（組別待確認）";
    return Object.assign(sumRows(name, parts), { personId: id, team, key: `${team}|${id}` });
  });
  return { rows: result, excluded };
}
