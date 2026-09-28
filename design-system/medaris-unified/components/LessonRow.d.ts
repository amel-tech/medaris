import * as React from 'react';

export interface LessonRowProps extends Omit<React.HTMLAttributes<HTMLLIElement>, 'title'> {
  /** rendered with dir="auto"; an Arabic run inside it carries lang="ar" dir="rtl" className="mds-arabic" */
  title: React.ReactNode;
  /** the PRD lesson type, lower-cased; fixes the glyph and the label. Only live is authored at launch */
  type: 'video' | 'document' | 'live' | 'quiz';
  /** current: the talebe's next lesson (aria-current="step" + the "Sıradaki" marker); done: a check */
  state?: 'default' | 'current' | 'done';
  /** locked: the viewer may not open it — the title stays readable, no link, a lock glyph */
  access?: 'open' | 'locked';
  /** the lesson or session page; ignored when locked */
  href?: string;
  /** default from content/status-map.json lessonType: Video ders, Doküman, Canlı ders, Sınav */
  typeLabel?: string;
  /** the kaynak reference ("Bina, s. 20–24"), in <bdi> */
  source?: string;
  /** <time datetime="PT45M">45 dk</time> at the row's end */
  durationMinutes?: number;
  /** ISO 8601 with offset: the session's start, for live lessons */
  startsAt?: string;
  /** the viewer's IANA zone; default the runtime's */
  timeZone?: string;
  /** the course's IANA zone: printed first, with its city, when it differs from the viewer's */
  courseTimeZone?: string;
  /** the city for courseTimeZone; default from content/time-zones.json cities */
  courseZoneName?: string;
  /** the visible marker on the current row; default "Sıradaki" */
  currentLabel?: string;
  /** visually hidden after a done title; default ", tamamlandı" */
  doneLabel?: string;
  /** the lock glyph's name; default "Kilitli" */
  lockedLabel?: string;
  /** after the viewer's time when two zones print; default "senin saatinle", Nizam "sizin saatinizle" */
  localTimeLabel?: string;
  /** default "dk" */
  minuteUnit?: string;
  /** default "tr-TR": the page's lang */
  locale?: string;
  /** badges or row actions, above the stretched link */
  trailing?: React.ReactNode;
  className?: string;
}
export declare function LessonRow(props: LessonRowProps): JSX.Element;
