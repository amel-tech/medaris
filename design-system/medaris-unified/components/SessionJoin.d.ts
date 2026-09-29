import * as React from 'react';

export interface SessionJoinProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** ISO 8601 with offset */
  startsAt: string;
  /** printed after the time: <time datetime="PT60M">60 dk</time> */
  durationMinutes?: number;
  /** the viewer's IANA zone; default the runtime's */
  timeZone?: string;
  /** the course's IANA zone: printed first, with its city, when it differs from the viewer's */
  courseTimeZone?: string;
  /** the city for courseTimeZone; default from content/time-zones.json cities */
  courseZoneName?: string;
  /** content/status-map.json session: upcoming is PLANNED, with a countdown */
  state?: 'upcoming' | 'live' | 'ended' | 'cancelled';
  /** the session's title, dir="auto"; the card is then named by it and the start. Leave it out on the session's own page */
  title?: React.ReactNode;
  /** the title's heading level; default 2 */
  headingLevel?: 2 | 3 | 4;
  /** resolved by the app from the link's host (libs/utils resolveMeetingPlatform); never parsed here */
  platform?: 'google-meet' | 'zoom' | 'jitsi' | 'unknown';
  /** default from content/meeting-platforms.json; "Bilinmeyen platform" for unknown */
  platformLabel?: string;
  /** the link's host, printed dir="ltr" in mono after an unknown platform's label */
  host?: string;
  /** the meeting link; absent, and not cancelled, the card says noLinkText */
  href?: string;
  /** ISO 8601: a change within the last 24 hours prints linkUpdatedText ("dün", "bugün") */
  linkUpdatedAt?: string;
  /** ended: where the recordings are */
  recordingsHref?: string;
  /** the calendar menu (B10) and similar, at the header's inline end */
  actions?: React.ReactNode;
  /** locked: lockedReason and the action slot; no link, platform or host */
  access?: 'enrolled' | 'locked';
  /** default "Bu oturumun bağlantısı kayıtlı talebelere açıktır." */
  lockedReason?: string;
  /** locked: the viewer's one action, from content/status-map.json enrolment.talebe cta; none while pending */
  action?: React.ReactNode;
  /** ISO 8601 instant the card is rendered for; default the clock, re-read every 30 s */
  now?: string;
  /** upcoming: the join button shows from this many minutes before the start; default 10 (a draft rule) */
  joinWindowMinutes?: number;
  /** the eyebrow that names the card; default "Canlı ders" */
  label?: string;
  /** default "Şu an canlı" */
  liveLabel?: string;
  /** default "Sona erdi" */
  endedLabel?: string;
  /** default "İptal edildi" */
  cancelledLabel?: string;
  /** default "Bu oturum iptal edildi." */
  cancelledText?: string;
  /** default "Bağlantı henüz eklenmedi." */
  noLinkText?: string;
  /** before the join window; {minutes} is joinWindowMinutes. Default "Katılım, ders başlamadan {minutes} dakika önce açılır." */
  joinOpensText?: string;
  /** default "Derse katıl" */
  joinLabel?: string;
  /** visually hidden after joinLabel; default " (yeni sekmede açılır)" */
  newTabLabel?: string;
  /** the disclosure that holds the meeting link; default "Bağlantıyı göster" */
  revealLabel?: string;
  /** {when} is "dün" or "bugün" from Intl.RelativeTimeFormat. Default "Bağlantı {when} güncellendi." */
  linkUpdatedText?: string;
  /** default "Ders kayıtlarına git" */
  recordingsLabel?: string;
  /** after the viewer's time when two zones print; default "senin saatinle" */
  localTimeLabel?: string;
  /** default "dk" */
  minuteUnit?: string;
  /** dates and numbers; default the nearest lang attribute, else tr-TR */
  locale?: string;
  className?: string;
}
export declare function SessionJoin(props: SessionJoinProps): JSX.Element;
