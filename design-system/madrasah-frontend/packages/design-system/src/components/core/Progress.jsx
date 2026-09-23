import React from "react";

export function ProgressBar({ value = 0, height = 5, tone, showLabel = false, label, style }) {
  const pct = Math.max(0, Math.min(1, value));
  const fill = tone ? `var(--${tone})` : pct >= 1 ? "var(--success)" : "var(--accent)";
  return (
    <div style={style}>
      <div style={{ height, background: "var(--surface-sunken)", borderRadius: "var(--r-pill)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct * 100}%`, background: fill, borderRadius: "var(--r-pill)" }} />
      </div>
      {(showLabel || label) && (
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 6,
          font: "var(--fw-regular) var(--fs-11)/1.3 var(--font-ui)", color: "var(--muted)",
        }}>
          <span>{label ?? `%${Math.round(pct * 100)} tamamlandı`}</span>
        </div>
      )}
    </div>
  );
}

export function ProgressRing({ value = 0, size = 58, thickness = 7, style }) {
  const r = (size - thickness) / 2 - 1;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style} aria-hidden="true">
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
      <circle
        cx={mid} cy={mid} r={r} fill="none" stroke="var(--accent)" strokeWidth={thickness}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
        transform={`rotate(-90 ${mid} ${mid})`}
      />
    </svg>
  );
}
