import React from "react";
import { Icon } from "../brand/Icon";

const TYPES = {
  video: { label: "Video", icon: "playCircle", color: "var(--type-video)", bg: "var(--accent-soft)" },
  doc:   { label: "Doküman", icon: "pdf", color: "var(--type-doc)", bg: "var(--surface-sunken)" },
  live:  { label: "Canlı halka", icon: "headset", color: "var(--type-live)", bg: "var(--danger-bg)" },
  quiz:  { label: "Sınav", icon: "quiz", color: "var(--type-quiz)", bg: "var(--warning-bg)" },
};

export function LessonRow({
  title, type = "video", duration, source, typeLabel,
  done = false, current = false, indent = 58, trailing, style,
}) {
  const t = TYPES[type] ?? TYPES.video;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "8px 16px",
      paddingLeft: current ? indent - 2 : indent,
      background: current ? "rgba(29, 78, 216, 0.04)" : "transparent",
      borderLeft: current ? "2px solid var(--accent)" : "2px solid transparent",
      ...style,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: "var(--r-pill)", flexShrink: 0,
        display: "grid", placeItems: "center",
        background: done ? "var(--success-bg)" : current ? "var(--accent-soft)" : t.bg,
        color: done ? "var(--success)" : current ? "var(--accent)" : t.color,
      }}>
        <Icon name={done ? "check" : t.icon} size={13} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          font: `${current ? "var(--fw-semibold)" : "var(--fw-medium)"} var(--fs-13)/1.35 var(--font-ui)`,
          color: done ? "var(--muted)" : "var(--ink)",
          textDecoration: done ? "line-through" : "none",
          textDecorationColor: "rgba(100,116,139,.4)",
        }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--muted)" }}>
            {typeLabel ?? t.label}
          </span>
          {source && (
            <>
              <span style={{ width: 2, height: 2, borderRadius: "var(--r-pill)", background: "var(--faint)" }} />
              <span style={{ font: "var(--fw-regular) var(--fs-11)/1 var(--font-ui)", color: "var(--accent)" }}>{source}</span>
            </>
          )}
        </div>
      </div>

      {trailing}
      {duration && (
        <span style={{
          font: "var(--fw-regular) var(--fs-12)/1 var(--font-ui)", color: "var(--muted)",
          minWidth: 56, textAlign: "right",
        }}>{duration}</span>
      )}
    </div>
  );
}
