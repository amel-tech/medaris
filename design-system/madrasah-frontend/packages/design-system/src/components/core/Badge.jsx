import React from "react";

const TONES = {
  neutral:  { color: "var(--muted)", background: "var(--surface-sunken)" },
  accent:   { color: "var(--accent)", background: "var(--accent-soft)" },
  success:  { color: "var(--success-fg)", background: "var(--success-bg)" },
  warning:  { color: "var(--warning)", background: "var(--warning-bg)" },
  live:     { color: "var(--danger)", background: "var(--danger-bg)" },
  published:{ color: "var(--text-inverse)", background: "var(--action-primary)" },
  draft:    { color: "var(--text-inverse)", background: "var(--slate-500)" },
};

export function Badge({ tone = "neutral", icon, dot = false, shape = "pill", children, style, ...rest }) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        font: "var(--fw-semibold) var(--fs-12)/1 var(--font-ui)",
        padding: shape === "chip" ? "5px 12px" : "3px 9px",
        borderRadius: shape === "chip" ? "var(--r-status-chip)" : "var(--r-badge)",
        whiteSpace: "nowrap", ...t, ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: "currentColor" }} />}
      {icon}
      {children}
    </span>
  );
}
