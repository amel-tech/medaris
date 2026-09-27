import React from "react";

const BASE = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "none", cursor: "pointer", textDecoration: "none",
  fontFamily: "var(--font-ui)", fontWeight: "var(--fw-medium)",
  whiteSpace: "nowrap",
};

const SIZES = {
  sm: { padding: "7px 12px", fontSize: "var(--fs-13)", gap: 6, borderRadius: "var(--r-6)" },
  md: { padding: "10px 16px", fontSize: "var(--fs-14)", gap: 8, borderRadius: "var(--r-8)" },
  lg: { padding: "12px 18px", fontSize: "var(--fs-15)", gap: 8, borderRadius: "var(--r-9)" },
};

const VARIANTS = {
  primary: { background: "var(--action-primary)", color: "var(--text-inverse)" },
  create:  { background: "var(--action-create)", color: "var(--text-inverse)" },
  danger:  { background: "var(--danger)", color: "var(--text-inverse)" },
  ghost:   { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" },
  quiet:   { background: "transparent", color: "var(--muted)" },
  link:    { background: "transparent", color: "var(--accent)", padding: 0, fontWeight: "var(--fw-medium)" },
};

export function Button({
  variant = "primary", size = "md", icon, iconAfter, fullWidth,
  disabled, as = "button", children, style, ...rest
}) {
  const Tag = as;
  return (
    <Tag
      disabled={Tag === "button" ? disabled : undefined}
      style={{
        ...BASE, ...SIZES[size], ...VARIANTS[variant],
        ...(variant === "link" ? { padding: 0 } : null),
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : undefined,
        transition: "var(--transition-hover)",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
      {iconAfter}
    </Tag>
  );
}
