import React from "react";
import { Icon } from "../brand/Icon";

/**
 * Centered modal. Pass contained when rendering inside a fixed-size frame
 * (canvas artboard, embedded preview) so the scrim stays inside its container.
 */
export function Dialog({
  open = true, onClose, eyebrow, title, headerExtra, actions,
  width = 960, contained = false, children, style,
}) {
  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: contained ? "absolute" : "fixed", inset: 0, zIndex: 100,
        background: "var(--scrim-dialog)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: contained ? "flex-start" : "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)", borderRadius: "var(--r-14)",
          width: `min(${width}px, 100%)`,
          maxHeight: contained ? "calc(100% - 48px)" : "92vh",
          marginTop: contained ? 60 : 0,
          display: "flex", flexDirection: "column",
          boxShadow: "var(--shadow-dialog)",
          ...style,
        }}
      >
        <div style={{ padding: "20px 24px 18px", borderBottom: "1px solid var(--line-soft)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div>
              {eyebrow && (
                <div style={{
                  font: "var(--fw-semibold) var(--fs-11)/1 var(--font-ui)",
                  letterSpacing: "var(--tracking-eyebrow)", textTransform: "uppercase",
                  color: "var(--muted)", marginBottom: 4,
                }}>{eyebrow}</div>
              )}
              {title && (
                <h2 style={{
                  margin: 0, font: "var(--fw-bold) var(--fs-22)/1.2 var(--font-ui)",
                  letterSpacing: "var(--tracking-heading)", color: "var(--ink)",
                }}>{title}</h2>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              {headerExtra}
              {onClose && (
                <button
                  onClick={onClose} aria-label="Kapat"
                  style={{
                    background: "var(--surface-alt)", border: "none", borderRadius: "var(--r-6)",
                    padding: 8, cursor: "pointer", color: "var(--ink)", display: "flex",
                  }}
                >
                  <Icon name="close" size={18} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "16px 24px 24px", flex: 1 }}>{children}</div>

        {actions && (
          <div style={{
            borderTop: "1px solid var(--line-soft)", padding: "14px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          }}>{actions}</div>
        )}
      </div>
    </div>
  );
}
