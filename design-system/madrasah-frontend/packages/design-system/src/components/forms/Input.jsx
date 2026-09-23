import React from "react";

export const controlStyle = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-input)",
  padding: "11px 14px",
  font: "var(--fw-regular) var(--fs-15)/1.4 var(--font-ui)",
  color: "var(--ink)",
  background: "var(--surface)",
  outline: "none",
  boxSizing: "border-box",
};

export function Input({ mono = false, invalid = false, style, ...rest }) {
  return (
    <input
      style={{
        ...controlStyle,
        ...(mono ? { fontFamily: "var(--font-mono)", fontSize: "var(--fs-13-5)" } : null),
        ...(invalid ? { borderColor: "var(--danger)" } : null),
        ...style,
      }}
      {...rest}
    />
  );
}

export function Textarea({ rows = 3, style, ...rest }) {
  return (
    <textarea
      rows={rows}
      style={{
        ...controlStyle,
        fontFamily: "inherit",
        lineHeight: "var(--lh-body)",
        resize: "vertical",
        ...style,
      }}
      {...rest}
    />
  );
}
