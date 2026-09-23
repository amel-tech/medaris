import React from "react";

export function Field({ label, required = false, hint, htmlFor, children, style }) {
  return (
    <label htmlFor={htmlFor} style={{ display: "block", ...style }}>
      {label && (
        <div style={{
          font: "var(--fw-medium) var(--fs-14)/1.3 var(--font-ui)",
          color: "var(--ink)", marginBottom: 7,
        }}>
          {label}
          {required && <span style={{ color: "var(--danger)", marginLeft: 4 }}>*</span>}
        </div>
      )}
      {children}
      {hint && (
        <div style={{
          font: "var(--fw-regular) var(--fs-13)/1.45 var(--font-ui)",
          color: "var(--muted)", marginTop: 7,
        }}>{hint}</div>
      )}
    </label>
  );
}
