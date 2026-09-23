import React from "react";
import { Icon } from "../brand/Icon";

export function Breadcrumb({ items = [], size = "md", style }) {
  const fs = size === "sm" ? "var(--fs-13)" : "var(--fs-15)";
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 9, ...style }}>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const label = typeof it === "string" ? it : it.label;
        const href = typeof it === "string" ? undefined : it.href;
        const node = (
          <span style={{
            font: `${last ? "var(--fw-medium)" : "var(--fw-regular)"} ${fs}/1.3 var(--font-ui)`,
            color: last ? "var(--ink)" : "var(--muted)",
          }}>{label}</span>
        );
        return (
          <React.Fragment key={i}>
            {i > 0 && <Icon name="chevronRight" size={size === "sm" ? 13 : 15} style={{ color: "var(--faint)" }} />}
            {href && !last ? <a href={href} style={{ textDecoration: "none" }}>{node}</a> : node}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
