import type { CSSProperties } from "react";

export interface ProgressBarProps {
  /** 0-1. @default 0 */
  value?: number;
  /** Track height. 5 in cards, 6 in enroll/header bars. @default 5 */
  height?: number;
  /** Force a fill color token name, e.g. "accent" | "success". Defaults to accent, or success at 100%. */
  tone?: string;
  /** Render the "%N tamamlandı" line under the track. @default false */
  showLabel?: boolean;
  /** Replace the default label text. */
  label?: string;
  style?: CSSProperties;
}

export interface ProgressRingProps {
  /** 0-1. @default 0 */
  value?: number;
  /** @default 58 */
  size?: number;
  /** @default 7 */
  thickness?: number;
  style?: CSSProperties;
}

/** Pill progress track — the only progress form in lists, cards and headers. */
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
/** Ring progress — dashboard tiles only. */
export declare function ProgressRing(props: ProgressRingProps): JSX.Element;
