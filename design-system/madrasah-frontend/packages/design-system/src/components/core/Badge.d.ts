import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "style"> {
  /** neutral | accent ("Devam ediyor") | success ("Tamamlandı"/"Aktif") | warning ("Sınav")
   *  | live ("Canlı ders") | published ("Yayında") | draft ("Taslak"). @default "neutral" */
  tone?: "neutral" | "accent" | "success" | "warning" | "live" | "published" | "draft";
  /** Leading <Icon />. */
  icon?: ReactNode;
  /** Leading filled dot — used for live/scheduled states. @default false */
  dot?: boolean;
  /** pill = rounded (default). chip = squarer, for the status tag on a Nizam cover. @default "pill" */
  shape?: "pill" | "chip";
  children?: ReactNode;
  style?: CSSProperties;
}

/** Status label. Tone must match the system's status vocabulary — see DESIGN_RULES.md §8. */
export declare function Badge(props: BadgeProps): JSX.Element;
