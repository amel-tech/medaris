import type { CSSProperties, ReactNode } from "react";

export interface LessonRowProps {
  title: string;
  /** Content taxonomy — drives icon + color. NOTE: only "live" is authorable in Nizam
   *  at this project stage; the others render in Tedris study screens. @default "video" */
  type?: "video" | "doc" | "live" | "quiz";
  /** e.g. "31 dk" | "PDF" | "10 soru". */
  duration?: string;
  /** Linked kaynak reference, rendered in --accent, e.g. "Bina · s. 20-24". */
  source?: string;
  /** Override the type label, e.g. "Canlı ders" instead of "Canlı halka". */
  typeLabel?: string;
  /** Completed: green check + struck-through title. @default false */
  done?: boolean;
  /** The lesson the talebe is on: accent left bar + tinted row. @default false */
  current?: boolean;
  /** Left padding to align under a week medallion. @default 58 */
  indent?: number;
  /** Slot before the duration — badges or row actions. */
  trailing?: ReactNode;
  style?: CSSProperties;
}

/** One lesson inside a week. Type determines icon and color — never restyle per screen. */
export declare function LessonRow(props: LessonRowProps): JSX.Element;
