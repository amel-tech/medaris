import React from "react";

/** Checkbox + icon + title + description, as used for Nizam course settings. */
export function CheckboxRow({ checked = false, icon, title, description, onChange, style }) {
  return (
    <label style={{
      display: "flex", gap: 12, cursor: "pointer",
      border: "1px solid var(--line)", borderRadius: "var(--r-11)",
      padding: 16, ...style,
    }}>
      <span
        role="checkbox" aria-checked={checked}
        onClick={onChange}
        style={{
          width: 20, height: 20, flexShrink: 0, marginTop: 2,
          borderRadius: "var(--r-3)",
          border: checked ? "none" : "1.5px solid var(--border)",
          background: checked ? "var(--action-primary)" : "transparent",
          color: "var(--text-inverse)",
          display: "grid", placeItems: "center",
        }}
      >
        {checked && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5L20 6" />
          </svg>
        )}
      </span>
      <span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          {icon && <span style={{ color: "var(--ink)", display: "flex" }}>{icon}</span>}
          <span style={{ font: "var(--fw-semibold) var(--fs-15)/1.3 var(--font-ui)", color: "var(--ink)" }}>{title}</span>
        </span>
        {description && (
          <span style={{ display: "block", font: "var(--fw-regular) var(--fs-13-5)/var(--lh-body) var(--font-ui)", color: "var(--muted)" }}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
