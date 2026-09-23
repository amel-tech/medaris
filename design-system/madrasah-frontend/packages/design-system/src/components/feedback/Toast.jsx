import React from "react";
import { Icon } from "../brand/Icon";

const TONES = {
  success: { icon: "check", color: "var(--success)", bg: "var(--success-bg)" },
  info:    { icon: "bell", color: "var(--accent)", bg: "var(--accent-soft)" },
  danger:  { icon: "close", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export function Toast({ tone = "success", title, description, action, anchored = true, style }) {
  const t = TONES[tone];
  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--surface)", border: "1px solid var(--line)",
        borderRadius: "var(--r-10)", padding: "14px 18px",
        boxShadow: "var(--shadow-toast)",
        ...(anchored ? { position: "absolute", right: 28, bottom: 24 } : null),
        ...style,
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: "var(--r-pill)", flexShrink: 0,
        display: "grid", placeItems: "center", background: t.bg, color: t.color,
      }}>
        <Icon name={t.icon} size={15} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ font: "var(--fw-semibold) var(--fs-14)/1.3 var(--font-ui)", color: "var(--ink)" }}>{title}</div>
        {description && (
          <div style={{ font: "var(--fw-regular) var(--fs-13)/1.4 var(--font-ui)", color: "var(--muted)", marginTop: 1 }}>
            {description}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
