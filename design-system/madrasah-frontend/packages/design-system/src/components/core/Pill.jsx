import React from "react";

export function Pill({ active = false, tag = false, icon, children, style, ...rest }) {
  const skin = tag
    ? { background: "var(--surface-sunken)", color: "var(--ink)", cursor: "default" }
    : active
    ? { background: "var(--action-primary)", color: "var(--text-inverse)" }
    : { background: "var(--surface-sunken)", color: "var(--ink)" };

  return (
    <button
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        border: "none", borderRadius: "var(--r-pill)",
        padding: tag ? "4px 10px" : "8px 14px",
        font: `var(--fw-medium) ${tag ? "var(--fs-12)" : "var(--fs-13)"}/1 var(--font-ui)`,
        whiteSpace: "nowrap", flexShrink: 0,
        cursor: tag ? "default" : "pointer",
        transition: "var(--transition-hover)",
        ...skin, ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
