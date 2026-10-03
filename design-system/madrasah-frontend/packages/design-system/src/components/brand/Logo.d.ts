import type { CSSProperties } from "react";

export interface LogoProps {
  /** Which app's mark. @default "madrasah" */
  mark?: "madrasah" | "nizam";
  /** Glyph box in px. Sidebar uses 40-44, inline chips 13-24. @default 40 */
  size?: number;
  /** Render the wordmark beside the glyph. @default false */
  withWordmark?: boolean;
  /** Small line under the wordmark, e.g. "Online Madrasah". Requires withWordmark. */
  subtitle?: string;
  style?: CSSProperties;
}

/** The brand marks. Never redraw or recolor these. */
export declare function Logo(props: LogoProps): JSX.Element;
