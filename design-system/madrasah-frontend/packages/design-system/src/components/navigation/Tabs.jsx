import React from "react";

export function Tabs({ items = [], value, onChange, underline = "accent", size = "md", style }) {
  const fs = size === "sm" ? "var(--fs-13)" : "var(--fs-14)";
  const lineColor = underline === "green" ? "var(--green)" : underline === "ink" ? "var(--ink)" : "var(--accent)";
  return (
    <div style={{ display: "flex", gap: 26, borderBottom: "1px solid var(--line)", ...style }}>
      {items.map((it) => {
        const id = typeof it === "string" ? it : it.id;
        const label = typeof it === "string" ? it : it.label;
        const badge = typeof it === "string" ? undefined : it.badge;
        const on = value === id;
        return (
          <button
            key={id} onClick={() => onChange?.(id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "none", border: "none", cursor: "pointer",
              padding: "0 2px 12px",
              borderBottom: `2px solid ${on ? lineColor : "transparent"}`,
              font: `${on ? "var(--fw-semibold)" : "var(--fw-medium)"} ${fs}/1.3 var(--font-ui)`,
              color: on ? "var(--ink)" : "var(--muted)",
            }}
          >
            {label}
            {badge !== undefined && (
              <span style={{
                font: "var(--fw-semibold) var(--fs-11-5)/1 var(--font-ui)",
                padding: "2px 7px", borderRadius: "var(--r-pill)",
                background: on ? (underline === "green" ? "var(--success-bg)" : "var(--accent-soft)") : "var(--surface-sunken)",
                color: on ? (underline === "green" ? "var(--success-fg)" : "var(--accent)") : "var(--muted)",
              }}>{badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
