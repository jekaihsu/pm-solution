"use client";
import { Inbox, Loader2, MapPinOff, PlugZap, TriangleAlert, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  loading: Loader2,
  "not-located": MapPinOff,
  "not-connected": PlugZap,
  "no-demo": Inbox,
  error: TriangleAlert,
  empty: Inbox,
};

export default function EmptyState({ kind, title, children }: { kind: string; title: string; children?: React.ReactNode }) {
  const Icon = ICONS[kind] ?? Inbox;
  return (
    <div className={`empty-state ${kind === "error" ? "is-error" : ""}`}>
      <span className="empty-icon">
        <Icon size={18} strokeWidth={1.75} className={kind === "loading" ? "spin" : ""} />
      </span>
      <div className="empty-title">{title}</div>
      {children && <div className="empty-desc">{children}</div>}
    </div>
  );
}
