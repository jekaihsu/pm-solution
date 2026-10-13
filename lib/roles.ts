// Who may tick R01 "meets SOP": Lark open_ids listed in SOP_EDITORS (comma or
// space separated). Unset = nobody (fail closed), except with login disabled
// for local development.
import type { Session } from "./session";

export function sopPermission(session: Session | null): { canEdit: boolean; reason?: string } {
  if (process.env.AUTH_DISABLED === "1") return { canEdit: true };
  if (!session) return { canEdit: false, reason: "尚未登入。" };
  const editors = (process.env.SOP_EDITORS ?? "").split(/[\s,]+/).filter(Boolean);
  if (!editors.length) return { canEdit: false, reason: "管理員尚未設定可勾選的主管名單（SOP_EDITORS）。" };
  return editors.includes(session.openId) ? { canEdit: true } : { canEdit: false };
}
