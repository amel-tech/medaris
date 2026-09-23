import React from "react";

/**
 * The course/köşk cover placeholder: a soft oklch wash at a given hue with an
 * arabesque arc pattern. Stands in for real cover imagery everywhere.
 */
export function CoverPattern({ hue = 220, height = 140, label, dense = false, style }) {
  const id = `cp-${hue}-${height}`;
  return (
    <div style={{
      height,
      borderRadius: "var(--r-8)",
      background: `linear-gradient(135deg, oklch(0.94 0.04 ${hue}) 0%, oklch(0.88 0.07 ${hue}) 100%)`,
      color: `oklch(0.32 0.08 ${hue})`,
      position: "relative", overflow: "hidden",
      display: "flex", alignItems: "flex-end",
      padding: dense ? 14 : 18,
      ...style,
    }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.18 }} aria-hidden="true">
        <defs>
          <pattern id={id} width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M0 18a18 18 0 0 1 36 0M0 18a18 18 0 0 0 36 0" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      {label && (
        <div style={{
          position: "relative", font: `var(--fw-regular) var(--fs-11)/1 var(--font-mono)`,
          letterSpacing: "0.4px", textTransform: "uppercase", opacity: 0.7,
        }}>{label}</div>
      )}
    </div>
  );
}
