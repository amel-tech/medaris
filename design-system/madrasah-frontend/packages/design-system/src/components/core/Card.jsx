import React from "react";

export function Card({ app = "tedris", interactive = false, pad, media, footer, children, style, ...rest }) {
  const isNizam = app === "nizam";
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: `1px solid ${isNizam ? "var(--line)" : "var(--border)"}`,
        borderRadius: "var(--r-card)",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        cursor: interactive ? "pointer" : undefined,
        transition: interactive ? "var(--transition-hover)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {media}
      <div style={{ padding: pad ?? (isNizam ? "var(--pad-card-nizam)" : "var(--pad-card)"), flex: 1 }}>
        {children}
      </div>
      {footer && (
        <div style={{
          borderTop: "1px solid var(--line-soft)",
          padding: isNizam ? "14px var(--pad-card-nizam)" : "12px var(--pad-card)",
        }}>{footer}</div>
      )}
    </div>
  );
}
