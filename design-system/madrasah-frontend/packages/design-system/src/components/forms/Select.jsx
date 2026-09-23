import React from "react";
import { controlStyle } from "./Input";
import { Icon } from "../brand/Icon";

/** Display-only select surface (prototype pattern) or a real <select> when onChange is given. */
export function Select({ value, options, onChange, name, id, style }) {
  if (onChange) {
    return (
      <div style={{ position: "relative", ...style }}>
        <select
          id={id} name={name} value={value} onChange={onChange}
          style={{ ...controlStyle, appearance: "none", paddingRight: 38, cursor: "pointer" }}
        >
          {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", color: "var(--faint)", pointerEvents: "none" }}>
          <Icon name="chevronDown" size={16} />
        </span>
      </div>
    );
  }
  return (
    <div style={{ ...controlStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", ...style }}>
      <span>{value}</span>
      <Icon name="chevronDown" size={16} style={{ color: "var(--faint)" }} />
    </div>
  );
}
