// Who may tick "meets SOP": every logged-in member of the organisation (PM
// decision 2026-10-13: 控制組所有人都可以勾). Every tick records who and when.
// SOP_EDITORS (Lark open_ids, comma or space separated) narrows it if ever needed.
import type { Session } from "./session";

const list = (v?: string) => (v ?? "").split(/[\s,]+/).filter(Boolean);

export function sopPermission(session: Session | null): { canEdit: boolean; reason?: string } {
  if (process.env.AUTH_DISABLED === "1") return { canEdit: true };
  if (!session) return { canEdit: false, reason: "尚未登入。" };
  const editors = list(process.env.SOP_EDITORS);
  if (!editors.length || editors.includes("*")) return { canEdit: true };
  return editors.includes(session.openId) ? { canEdit: true } : { canEdit: false, reason: "此帳號不在可勾選名單（SOP_EDITORS）。" };
}

// 人事資料（薪水總表加班）：HR_VIEWERS 控制誰能看。
//   未設定／留空 ＝ 沒有人能看（安全預設）。
//   *（或清單裡含 *）＝ 所有登入的組織成員都能看（業主 2026-10-13 裁示：全部人都可以看人事頁面）。
//   open_id 清單（逗號或空白分隔）＝ 只有清單內的人能看。
export function hrPermission(session: Session | null): { canView: boolean; reason?: string } {
  if (process.env.AUTH_DISABLED === "1") return { canView: true };
  if (!session) return { canView: false, reason: "尚未登入。" };
  const viewers = list(process.env.HR_VIEWERS);
  if (!viewers.length) return { canView: false, reason: "管理員尚未設定可查看人事資料的名單（HR_VIEWERS）。" };
  if (viewers.includes("*")) return { canView: true };
  return viewers.includes(session.openId) ? { canView: true } : { canView: false, reason: "此帳號不在人事資料查看名單（HR_VIEWERS）。" };
}
