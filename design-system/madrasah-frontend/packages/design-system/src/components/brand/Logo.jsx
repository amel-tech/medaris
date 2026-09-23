import React from "react";

/**
 * Brand marks. "madrasah" is the talebe-facing Tedris mark (navy, dome + mihrab),
 * "nizam" is the müderris-facing management mark (dark shell, light arch).
 */
export function Logo({ mark = "madrasah", size = 40, withWordmark = false, subtitle, style }) {
  const glyph =
    mark === "nizam" ? (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
        <rect width="48" height="48" rx="12" fill="var(--nizam-shell)" />
        <path d="M24 13c-3.6 0-6.5 2.9-6.5 6.5V33a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V19.5C30.5 15.9 27.6 13 24 13Z" fill="var(--nizam-shell-fg)" />
        <path d="M24 18c-1.7 0-3 1.3-3 3v12a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V21c0-1.7-1.3-3-3-3Z" fill="var(--nizam-shell)" />
      </svg>
    ) : (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
        <rect width="48" height="48" rx="9" fill="var(--brand-navy)" />
        <path d="M24 9c-1.6 3-3.4 4.8-6 6.4v15.8h12V15.4C27.4 13.8 25.6 12 24 9Z" fill="#dbeafe" />
        <rect x="18" y="33" width="12" height="6" fill="#dbeafe" />
        <rect x="22.2" y="20" width="3.6" height="11" rx="1.8" fill="var(--brand-navy)" />
        <circle cx="24" cy="12" r="0.9" fill="var(--brand-navy)" />
      </svg>
    );

  if (!withWordmark) return glyph;

  const word = mark === "nizam" ? "Nizam" : "Online Madrasah";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, ...style }}>
      {glyph}
      <div style={{ lineHeight: 1.15, minWidth: 0 }}>
        <div style={{
          font: `var(--fw-bold) ${mark === "nizam" ? "var(--fs-19)" : "var(--fs-17)"}/1.15 var(--font-ui)`,
          letterSpacing: "var(--tracking-heading)",
          color: mark === "nizam" ? "var(--ink)" : "var(--brand-navy)",
          whiteSpace: "nowrap",
        }}>{word}</div>
        {subtitle && (
          <div style={{ font: "var(--fw-regular) var(--fs-12-5)/1.3 var(--font-ui)", color: "var(--muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
