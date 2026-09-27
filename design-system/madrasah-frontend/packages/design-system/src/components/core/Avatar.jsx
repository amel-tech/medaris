import React from "react";

export function Avatar({ initials = "MD", hue, size = 32, shape = "circle", ring = true, style, ...rest }) {
  const hasHue = typeof hue === "number";
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: shape === "square" ? "var(--r-avatar-square)" : "var(--r-pill)",
        background: hasHue ? `oklch(0.92 0.05 ${hue})` : "var(--avatar-ground)",
        color: hasHue ? `oklch(0.32 0.08 ${hue})` : "var(--ink)",
        display: "grid", placeItems: "center",
        font: `var(--fw-semibold) ${Math.round(size * 0.38)}px/1 var(--font-ui)`,
        border: ring && shape === "circle" ? "2px solid var(--white)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {initials}
    </div>
  );
}

export function AvatarStack({ people = [], size = 30, max = 5, overflow, style }) {
  const shown = people.slice(0, max);
  const rest = overflow ?? Math.max(0, people.length - max);
  return (
    <div style={{ display: "flex", ...style }}>
      {shown.map((p, i) => (
        <div key={i} style={{ marginLeft: i ? -8 : 0 }}>
          <Avatar initials={p.initials} hue={p.hue} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <div style={{
          marginLeft: -8, width: size, height: size, borderRadius: "var(--r-pill)",
          background: "var(--surface-sunken)", color: "var(--muted)",
          display: "grid", placeItems: "center",
          font: `var(--fw-semibold) ${Math.round(size * 0.34)}px/1 var(--font-ui)`,
          border: "2px solid var(--white)",
        }}>+{rest}</div>
      )}
    </div>
  );
}
