import type { CSSProperties, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  /** Icon key. Line icons: search, bell, globe, home, book, table, sidebar, users,
   *  calendar, clock, headset, pdf, doc, quiz, playCircle, check, close, plus, trash,
   *  eye, link, download, upload, share, chat, filter, settings, certificate, shield,
   *  lock, bookmark, chevronDown/Right/Left, chevronsUpDown, arrowRight/Left, more.
   *  Filled-only: star, play (pass filled). */
  name: string;
  /** Rendered px box. Use 11-22; matches surrounding text size. @default 18 */
  size?: number;
  /** Use the filled variant. Only star and play have one. @default false */
  filled?: boolean;
  style?: CSSProperties;
}

/** The single line-icon set (stroke 1.6, round caps). Never mix in another icon library. */
export declare function Icon(props: IconProps): JSX.Element | null;
export declare const ICON_NAMES: string[];
export declare const FILLED_ICON_NAMES: string[];
