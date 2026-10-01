import { Progress as BaseProgress } from "@base-ui/react/progress";
import type { CSSProperties } from "react";
import { cx } from "./cx";
import { formatNumber, usePageLocale } from "./locale";

export interface ProgressProps {
  /** 0 to 100, clamped; the bar only moves forward */
  value?: number;
  /** required and visible: the bar is named by it */
  label: string;
  showValue?: boolean;
  /** read after "%100" when the bar is full */
  completeLabel?: string;
  locale?: string;
  className?: string;
}

/**
 * A determinate `.mds-progress` bar with its visible name, on Base UI's
 * Progress. The percent is Intl in the page's locale: %72 in Turkish. An
 * unknown wait is a `Skeleton`, not a bar.
 */
export function Progress({
  value = 0,
  label,
  showValue = false,
  completeLabel = "tamamlandı",
  locale,
  className,
}: ProgressProps) {
  const { ref, lang } = usePageLocale<HTMLDivElement>(locale);
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const done = pct === 100;
  const percent = (n: number) =>
    formatNumber(n, lang, { style: "percent", maximumFractionDigits: 0 });
  const text = done ? `${percent(1)} ${completeLabel}` : percent(pct / 100);
  return (
    <BaseProgress.Root
      ref={ref}
      value={pct}
      min={0}
      max={100}
      getAriaValueText={() => text}
      className={className || undefined}
    >
      <div className="mds-progress__label">
        <BaseProgress.Label render={<span />}>{label}</BaseProgress.Label>
        {showValue ? (
          <span className="mds-progress__value" aria-hidden="true">
            {done ? <span className="mds-progress__check" /> : null}
            {text}
          </span>
        ) : null}
      </div>
      <BaseProgress.Track className="mds-progress">
        <BaseProgress.Indicator
          className={cx("mds-progress__bar")}
          style={{ "--mds-progress": `${pct}%` } as CSSProperties}
        />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
