import React from "react";

export function SidebarItem({ icon, label, active = false, trailing, collapsed = false, style, ...rest }) {
  return (
    <div
      role="button"
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 12,
        justifyContent: collapsed ? "center" : undefined,
        padding: collapsed ? 0 : "10px 12px",
        width: collapsed ? 42 : undefined,
        height: collapsed ? 42 : undefined,
        borderRadius: collapsed ? "var(--r-9)" : "var(--r-7)",
        background: active ? "var(--nav-active)" : "transparent",
        color: active ? "var(--ink)" : "var(--slate-600)",
        font: `${active ? "var(--fw-semibold)" : "var(--fw-medium)"} var(--fs-15)/1.3 var(--font-ui)`,
        cursor: "pointer",
        transition: "var(--transition-hover)",
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: active ? "var(--ink)" : "var(--slate-500)", display: "flex" }}>{icon}</span>}
      {!collapsed && label}
      {!collapsed && trailing && <span style={{ marginLeft: "auto" }}>{trailing}</span>}
    </div>
  );
}
