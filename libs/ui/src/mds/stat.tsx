import type { ReactNode } from "react";
import { cx } from "./cx";
import { formatNumber, usePageLocale } from "./locale";

export interface StatProps {
  label: ReactNode;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "error";
  /** an icon or a delta label printed first; a tone colours the number only beside its cue */
  cue?: ReactNode;
  locale?: string;
  children?: ReactNode;
  className?: string;
}

/** A number on a card. Colour alone never says good or bad (MDS-COL-03): without a cue the tone is neutral. */
export function Stat({
  label,
  value,
  tone = "neutral",
  cue,
  locale,
  children,
  className,
}: StatProps) {
  const { ref, lang } = usePageLocale<HTMLDivElement>(locale);
  const shown = cue ? tone : "neutral";
  return (
    <div
      ref={ref}
      className={cx(
        "mds-card",
        "mds-stat",
        shown !== "neutral" && `mds-stat--${shown}`,
        className
      )}
    >
      <span className="mds-caption">{label}</span>
      <span className="mds-stat__value">
        {cue ? <span className="mds-stat__cue">{cue}</span> : null}
        {typeof value === "number" ? formatNumber(value, lang) : value}
      </span>
      {children}
    </div>
  );
}
