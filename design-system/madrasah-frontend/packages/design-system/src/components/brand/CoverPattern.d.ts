import type { CSSProperties } from "react";

export interface CoverPatternProps {
  /** oklch hue 0-360. Convention: Sarf 145/28, Nahiv 270/200, Mantık 60, Akaid 340, Tefsir 165. @default 220 */
  hue?: number;
  /** Cover height in px. Cards 84-150, hero bands 150-260. @default 140 */
  height?: number;
  /** Optional mono uppercase caption, bottom-left — usually the category. */
  label?: string;
  /** Tighter padding for small cards. @default false */
  dense?: boolean;
  style?: CSSProperties;
}

/** Cover-image stand-in. Use until real cover art exists; never replace with a flat gray box. */
export declare function CoverPattern(props: CoverPatternProps): JSX.Element;
