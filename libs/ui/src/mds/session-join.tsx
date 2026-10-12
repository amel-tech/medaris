"use client";

import {
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { cx } from "./cx";
import {
  formatDate,
  formatNumber,
  joinRun,
  usePageLocale,
  zoneName,
} from "./locale";

// Labels from content/meeting-platforms.json.
const platformLabels: Record<string, string> = {
  "google-meet": "Google Meet",
  zoom: "Zoom",
  jitsi: "Jitsi Meet",
  unknown: "Bilinmeyen platform",
};
const MINUTE = 60000;
const HOUR = 60 * MINUTE;

// The calendar day of an instant in a zone, as a day count, so "dün" and "yarın"
// follow the viewer's calendar rather than 24-hour spans.
function dayNumber(at: Date, timeZone?: string): number {
  const [y, m, d] = formatDate("en-CA", at, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .split("-")
    .map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / (24 * HOUR);
}

/**
 * "14 dakika sonra", "2 saat sonra", "Yarın", "3 gün sonra": a badge label, so
 * its first letter is upper-cased in the page's locale (MDS-VOICE-02). The
 * celse detail page's header badge says it too (MDRS-289).
 */
export function countdown(
  locale: string,
  at: Date,
  now: Date,
  timeZone?: string
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ms = at.getTime() - now.getTime();
  let s: string;
  if (Math.abs(ms) < HOUR) s = rtf.format(Math.round(ms / MINUTE), "minute");
  else if (Math.abs(ms) < 24 * HOUR)
    s = rtf.format(Math.round(ms / HOUR), "hour");
  else
    s = rtf.format(dayNumber(at, timeZone) - dayNumber(now, timeZone), "day");
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

export interface SessionJoinProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** ISO instant */
  startsAt: string;
  durationMinutes?: number;
  /** the viewer's zone */
  timeZone?: string;
  courseTimeZone?: string;
  courseZoneName?: string;
  state?: "upcoming" | "live" | "ended" | "cancelled";
  title?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  platform?: string;
  platformLabel?: string;
  host?: string;
  href?: string;
  linkUpdatedAt?: string;
  recordingsHref?: string;
  /** a live celse: how long it has been running, already worded ("14 dakikadır sürüyor"); sits after the length */
  elapsedText?: string;
  actions?: ReactNode;
  access?: "enrolled" | "locked";
  lockedReason?: string;
  action?: ReactNode;
  /** a fixed "now" (tests, snapshots); without it the card re-renders every 30 s */
  now?: string | number | Date;
  joinWindowMinutes?: number;
  /** held face to face (MDRS-283): without a link, the card says so instead of "no link yet" */
  inPerson?: boolean;
  /** a live stream is set (MDRS-283): without a link, the card says where it plays */
  hasLiveStream?: boolean;
  label?: string;
  liveLabel?: string;
  endedLabel?: string;
  cancelledLabel?: string;
  cancelledText?: string;
  /** no link, no stream, not in person */
  noLinkText?: string;
  /** in person, no link, no stream */
  inPersonText?: string;
  /** a stream and no link, before the start */
  streamText?: string;
  /** a stream and no link, while the celse runs */
  streamLiveText?: string;
  /** in person with a stream and no link, before the start */
  inPersonStreamText?: string;
  /** in person with a stream and no link, while the celse runs */
  inPersonStreamLiveText?: string;
  joinOpensText?: string;
  joinLabel?: string;
  newTabLabel?: string;
  revealLabel?: string;
  linkUpdatedText?: string;
  recordingsLabel?: string;
  localTimeLabel?: string;
  minuteUnit?: string;
  locale?: string;
}

/** `.mds-join`: the card a talebe joins a live celse from. The link opens `joinWindowMinutes` before the start. */
export function SessionJoin({
  startsAt,
  durationMinutes,
  timeZone,
  courseTimeZone,
  courseZoneName,
  state = "upcoming",
  title,
  headingLevel = 2,
  platform,
  platformLabel,
  host,
  href,
  linkUpdatedAt,
  recordingsHref,
  elapsedText,
  actions,
  access = "enrolled",
  lockedReason = "Bu celsenin bağlantısı kayıtlı talebelere açıktır.",
  action,
  now,
  joinWindowMinutes = 10,
  inPerson = false,
  hasLiveStream = false,
  label = "Canlı ders",
  liveLabel = "Şu an canlı",
  endedLabel = "Sona erdi",
  cancelledLabel = "İptal edildi",
  cancelledText = "Bu celse iptal edildi.",
  noLinkText = "Bağlantı henüz eklenmedi.",
  inPersonText = "Bu celse yüz yüze yapılır. Kaydı eklenirse burada yayımlanır.",
  streamText = "Bu celse YouTube'da canlı yayınlanır; yayın celse başlayınca burada açılır.",
  streamLiveText = "Bu celse YouTube'da canlı yayınlanıyor; yayını bu sayfada izleyebilirsin.",
  inPersonStreamText = "Bu celse yüz yüze yapılır ve YouTube'da canlı yayınlanır; yayın celse başlayınca burada açılır.",
  inPersonStreamLiveText = "Bu celse yüz yüze yapılıyor ve YouTube'da canlı yayınlanıyor; yayını bu sayfada izleyebilirsin.",
  joinOpensText = "Katılım, celse başlamadan {minutes} dakika önce açılır.",
  joinLabel = "Celseye katıl",
  newTabLabel = " (yeni sekmede açılır)",
  revealLabel = "Bağlantıyı göster",
  linkUpdatedText = "Bağlantı {when} güncellendi.",
  recordingsLabel = "Ders kayıtlarına git",
  localTimeLabel = "senin saatinle",
  minuteUnit = "dk",
  locale: localeProp,
  className,
  ...rest
}: SessionJoinProps) {
  const { ref, lang: locale } = usePageLocale<HTMLElement>(localeProp);
  const eyebrowId = `mds-join-${useId().replace(/[^\w-]/g, "")}`;
  const headingId = `${eyebrowId}-h`;
  const atId = `${eyebrowId}-at`;
  const Heading =
    `h${[2, 3, 4].includes(headingLevel) ? headingLevel : 2}` as "h2";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (now) return undefined;
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, [now]);

  const at = new Date(startsAt);
  const valid = !Number.isNaN(at.getTime());
  // Named by the title, or else the eyebrow, and the start: two cards are two distinct regions.
  const labelledBy = [title ? headingId : eyebrowId, valid && atId]
    .filter(Boolean)
    .join(" ");
  const nowAt = now ? new Date(now) : new Date();
  const locked = access === "locked";

  const day: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  };
  const clock: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  const course = courseTimeZone ?? timeZone;
  const times: ReactNode[] = [];
  if (valid) {
    const first = formatDate(locale, at, course, { ...day, ...clock });
    if (
      !courseTimeZone ||
      formatDate(locale, at, timeZone, { ...day, ...clock }) === first
    ) {
      times.push(
        <time key="at" id={atId} dateTime={startsAt}>
          {first}
        </time>
      );
    } else {
      const sameDay =
        formatDate(locale, at, timeZone, day) ===
        formatDate(locale, at, course, day);
      times.push(
        <time key="at" id={atId} dateTime={startsAt}>
          {first} {zoneName(course ?? "", courseZoneName)}
        </time>
      );
      times.push(
        <span key="local" className="mds-join__zone">
          {formatDate(
            locale,
            at,
            timeZone,
            sameDay ? clock : { weekday: "short", ...clock }
          )}{" "}
          {localTimeLabel}
        </span>
      );
    }
  }
  if (durationMinutes != null) {
    times.push(
      <time
        key="dur"
        className="mds-join__zone"
        dateTime={`PT${durationMinutes}M`}
      >
        {formatNumber(durationMinutes, locale)} {minuteUnit}
      </time>
    );
  }

  if (elapsedText && state === "live") {
    times.push(
      <span key="elapsed" className="mds-join__zone">
        {elapsedText}
      </span>
    );
  }

  let badge: ReactNode = null;
  if (state === "live")
    badge = (
      <span className="mds-badge mds-badge--live">
        <span className="mds-badge__dot" aria-hidden="true" />
        {liveLabel}
      </span>
    );
  else if (state === "ended")
    badge = <span className="mds-badge mds-badge--ghost">{endedLabel}</span>;
  else if (state === "cancelled")
    badge = (
      <span className="mds-badge mds-badge--outline">{cancelledLabel}</span>
    );
  else if (valid)
    badge = (
      <span className="mds-badge mds-badge--secondary">
        <time dateTime={startsAt}>
          {countdown(locale, at, nowAt, timeZone)}
        </time>
      </span>
    );

  const status = (text: string, extra?: string) => (
    <p className={cx("mds-join__status", extra)}>{text}</p>
  );
  const open = state === "upcoming" || state === "live";
  const windowOpen =
    state === "live" ||
    !valid ||
    at.getTime() - nowAt.getTime() <= joinWindowMinutes * MINUTE;
  // An unknown host prints "Bilinmeyen platform" and the host (MDS-DOM-03).
  const known =
    platform === "unknown"
      ? undefined
      : platform
        ? platformLabels[platform]
        : undefined;
  const chip =
    !locked && open && platform ? (
      <span className={`mds-platform-chip mds-platform-chip--${platform}`}>
        <span className="mds-platform-chip__dot" aria-hidden="true" />
        {platformLabel ?? known ?? platformLabels.unknown}
        {!known && host ? (
          <span className="mds-platform-chip__host" dir="ltr">
            {host}
          </span>
        ) : null}
      </span>
    ) : null;

  let body: ReactNode = null;
  if (state === "cancelled") body = status(cancelledText);
  else if (locked)
    body = (
      <div className="mds-join__action">
        {status(lockedReason, "mds-join__status--locked")}
        {action}
      </div>
    );
  else if (state === "ended")
    body = recordingsHref ? (
      <a
        className="mds-btn mds-btn--secondary mds-btn--large mds-btn--full"
        href={recordingsHref}
      >
        {recordingsLabel}
      </a>
    ) : null;
  else if (!href) {
    // MDRS-283: a celse without a link is still covered by a stream or by
    // being held in person, and the card says which. A link, when there is
    // one, stays the way in whatever else the celse has.
    const live = state === "live";
    let text = noLinkText;
    if (inPerson && hasLiveStream)
      text = live ? inPersonStreamLiveText : inPersonStreamText;
    else if (hasLiveStream) text = live ? streamLiveText : streamText;
    else if (inPerson) text = inPersonText;
    body = status(text);
  } else if (!windowOpen)
    body = status(
      joinOpensText.replace(
        "{minutes}",
        formatNumber(joinWindowMinutes, locale)
      )
    );
  else
    body = (
      <div className="mds-join__action">
        <a
          className="mds-btn mds-btn--primary mds-btn--large mds-btn--full mds-join__link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {joinLabel}
          <span className="mds-visually-hidden">{newTabLabel}</span>
        </a>
        <details className="mds-join__reveal">
          <summary>{revealLabel}</summary>
          <p className="mds-join__url" dir="ltr">
            {href}
          </p>
        </details>
      </div>
    );

  // A link changed within the last 24 hours.
  let notice: ReactNode = null;
  const updated = linkUpdatedAt ? new Date(linkUpdatedAt) : null;
  if (!locked && open && href && updated) {
    const age = nowAt.getTime() - updated.getTime();
    if (age >= 0 && age < 24 * HOUR) {
      const when = new Intl.RelativeTimeFormat(locale, {
        numeric: "auto",
      }).format(
        dayNumber(updated, timeZone) - dayNumber(nowAt, timeZone),
        "day"
      );
      notice = (
        <p className="mds-join__notice">
          {linkUpdatedText.replace("{when}", when)}
        </p>
      );
    }
  }

  return (
    <section
      ref={ref}
      className={cx("mds-join", className)}
      aria-labelledby={labelledBy}
      {...rest}
    >
      <header className="mds-join__header">
        <p className="mds-eyebrow" id={eyebrowId}>
          {label}
        </p>
        {badge}
        {actions ? <div className="mds-join__actions">{actions}</div> : null}
      </header>
      {title ? (
        <Heading className="mds-join__title" id={headingId} dir="auto">
          {title}
        </Heading>
      ) : null}
      {times.length > 0 ? (
        <p className="mds-join__time">
          {valid ? (
            <>
              {times[0]}
              {joinRun(times.slice(1))}
            </>
          ) : (
            joinRun(times)
          )}
        </p>
      ) : null}
      {chip}
      {body}
      {notice}
    </section>
  );
}
