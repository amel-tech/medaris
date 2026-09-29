import * as React from 'react';

export interface WeekAccordionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'onToggle'> {
  /** the week's number: the medallion and the "Hafta N" eyebrow */
  week: number;
  /** rendered with dir="auto"; an Arabic run inside it carries lang="ar" dir="rtl" className="mds-arabic", without harakat */
  title: React.ReactNode;
  /** active: the talebe's current week ("Devam ediyor", opens by default); done: a check ("Tamamlandı") */
  state?: 'default' | 'active' | 'done';
  /** locked: the viewer is not enrolled — the week still expands; its rows are LessonRow access="locked" */
  access?: 'open' | 'locked';
  /** ISO date the week opens, if it is not open yet: shown visibly; the week still expands */
  opensOn?: string;
  /** one line above the lessons, dir="auto"; an Arabic run in it gets className="mds-arabic", without harakat */
  summary?: React.ReactNode;
  /** at the header's end, after the opening date: "4 ders · 135 dk" */
  meta?: React.ReactNode;
  /** controlled open state; leave it out and the week keeps its own */
  open?: boolean;
  /** default: true for the active week */
  defaultOpen?: boolean;
  onToggle?: WeekToggleHandler;
  /** default 3 */
  headingLevel?: 2 | 3 | 4;
  /** role="region" on the panel: only when the course has six weeks or fewer */
  region?: boolean;
  /** the eyebrow; {week} is the number. Default "Hafta {week}" */
  weekLabel?: string;
  /** default "Devam ediyor" */
  activeLabel?: string;
  /** default "Tamamlandı" */
  doneLabel?: string;
  /** visually hidden after a locked week's title; default ", kilitli" */
  lockedLabel?: string;
  /** {date} is the opening date. Default "{date} tarihinde açılır" */
  opensOnLabel?: string;
  /** in the panel of a week with no lessons; default "Bu hafta için henüz ders eklenmedi." */
  emptyLabel?: string;
  /** dates and numbers; default the nearest lang attribute, else tr-TR */
  locale?: string;
  /** LessonRow markup: each an li.mds-lesson-row, wrapped here in ol.mds-lesson-list */
  children?: React.ReactNode;
  className?: string;
}

export type WeekToggleHandler = (open: boolean) => void;

export declare function WeekAccordion(props: WeekAccordionProps): JSX.Element;
