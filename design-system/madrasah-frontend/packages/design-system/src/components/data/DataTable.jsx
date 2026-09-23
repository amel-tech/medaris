import React from "react";

/** Dense hairline table — the Nizam list pattern (desteler, köşkler, talebeler). */
export function DataTable({ columns = [], rows = [], rowKey, empty = "Kayıt yok.", style }) {
  const template = columns.map((c) => c.width ?? "1fr").join(" ");
  return (
    <div style={{
      border: "1px solid var(--line)", borderRadius: "var(--r-10)",
      overflow: "hidden", ...style,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: template,
        padding: "11px 18px", background: "var(--surface-table-head)",
        borderBottom: "1px solid var(--line)",
        font: "var(--fw-semibold) var(--fs-12-5)/1.3 var(--font-ui)", color: "var(--muted)",
      }}>
        {columns.map((c, i) => (
          <div key={i} style={{ textAlign: c.align ?? "left" }}>{c.header}</div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "22px 18px", font: "var(--fw-regular) var(--fs-14)/1.4 var(--font-ui)", color: "var(--muted)" }}>
          {empty}
        </div>
      ) : (
        rows.map((row, r) => (
          <div
            key={rowKey ? rowKey(row, r) : r}
            style={{
              display: "grid", gridTemplateColumns: template,
              padding: "13px 18px", alignItems: "center",
              borderBottom: r < rows.length - 1 ? "1px solid var(--line-soft)" : "none",
              font: "var(--fw-regular) var(--fs-14)/1.4 var(--font-ui)", color: "var(--ink)",
            }}
          >
            {columns.map((c, i) => (
              <div key={i} style={{
                textAlign: c.align ?? "left",
                display: c.align === "right" ? "flex" : undefined,
                justifyContent: c.align === "right" ? "flex-end" : undefined,
                gap: c.align === "right" ? 6 : undefined,
                color: c.muted ? "var(--muted)" : undefined,
                fontWeight: c.strong ? "var(--fw-semibold)" : undefined,
                minWidth: 0,
              }}>
                {c.cell ? c.cell(row, r) : row[c.key]}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
