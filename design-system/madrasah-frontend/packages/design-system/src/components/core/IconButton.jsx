import React from "react";

const SIZES = { sm: 32, md: 38, lg: 40 };

export function IconButton({ icon, label, variant = "ghost", size = "md", style, ...rest }) {
  const px = SIZES[size];
  const skin =
    variant === "bare"
      ? { background: "transparent", border: "none", color: "var(--muted)" }
      : variant === "solid"
      ? { background: "var(--action-primary)", border: "none", color: "var(--text-inverse)" }
      : { background: "var(--surface)", border: "1px solid var(--line)", color: "var(--slate-500)" };

  return (
    <button
      aria-label={label} title={label}
      style={{
        width: px, height: px, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: variant === "bare" ? "var(--r-4)" : "var(--r-9)",
        cursor: "pointer", padding: 0, flexShrink: 0,
        transition: "var(--transition-hover)", ...skin, ...style,
      }}
      {...rest}
    >
      {icon}
    </button>
  );
}
