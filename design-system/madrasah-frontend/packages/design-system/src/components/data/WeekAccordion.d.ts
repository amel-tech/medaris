import type { CSSProperties, ReactNode } from "react";

export interface WeekAccordionProps {
  /** Week number, shown in the medallion and the "Hafta N" eyebrow. */
  week: number;
  title: string;
  /** done = green check + "Tamamlandı". active = dark medallion + "Devam ediyor".
   *  locked = dashed outline + lock, not expandable. @default "default" */
  state?: "default" | "done" | "active" | "locked";
  /** One line describing the week, shown above the lesson list when open. */
  summary?: string;
  /** Right-aligned meta, e.g. <><span>4 ders</span><span>120 dk</span></>. */
  meta?: ReactNode;
  /** @default false */
  open?: boolean;
  onToggle?: () => void;
  /** Lesson rows. */
  children?: ReactNode;
  style?: CSSProperties;
}

/** A week in a müfredat. Lesson rows go in children as <LessonRow />. */
export declare function WeekAccordion(props: WeekAccordionProps): JSX.Element;
