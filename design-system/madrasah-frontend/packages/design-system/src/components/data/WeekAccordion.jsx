import React from "react";
import { Icon } from "../brand/Icon";
import { Badge } from "../core/Badge";

const STATE_ICON = { done: "check", locked: "lock" };

/** One week of a müfredat: status medallion, title, meta, and a disclosure body. */
export function WeekAccordion({
  week, title, state = "default", summary, meta, open = false, onToggle, children, style,
}) {
  const done = state === "done";
  const active = state === "active";
  const locked = state === "locked";

  return (
    <div style={{
      border: `1px solid ${active ? "#cbd5e1" : "var(--line)"}`,
      borderRadius: "var(--r-10)", overflow: "hidden",
      background: "var(--surface)", opacity: locked ? 0.85 : 1, ...style,
    }}>
      <div
        onClick={locked ? undefined : onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 16px", cursor: locked ? "default" : "pointer",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: "var(--r-pill)", flexShrink: 0,
          display: "grid", placeItems: "center",
          background: done ? "var(--success)" : active ? "var(--action-primary)" : "var(--surface)",
          border: locked ? "1.5px dashed var(--border)" : "none",
          color: locked ? "var(--faint)" : "var(--text-inverse)",
          font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
        }}>
          {done || locked ? <Icon name={STATE_ICON[state]} size={done ? 14 : 12} /> : week}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{
              font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
              letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase", color: "var(--muted)",
            }}>Hafta {week}</span>
            {active && <Badge tone="accent">Devam ediyor</Badge>}
            {done && <Badge tone="success">Tamamlandı</Badge>}
          </div>
          <div style={{
            font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)",
            color: locked ? "var(--muted)" : "var(--ink)",
          }}>{title}</div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)",
        }}>
          {meta}
          {!locked && (
            <Icon name="chevronDown" size={14}
              style={{ transform: open ? "none" : "rotate(-90deg)", transition: "var(--transition-disclosure)" }} />
          )}
        </div>
      </div>

      {open && !locked && (
        <div style={{ borderTop: "1px solid var(--line-soft)", padding: "6px 0" }}>
          {summary && (
            <div style={{
              padding: "8px 16px 4px 58px",
              font: `var(--fw-regular) var(--fs-12)/var(--lh-body) var(--font-ui)`, color: "var(--muted)",
            }}>{summary}</div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
