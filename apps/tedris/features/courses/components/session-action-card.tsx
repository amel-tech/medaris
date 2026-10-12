"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import type { ReactNode } from "react";
import { joinRun } from "../join-run";
import type { ReleaseWords } from "../recordings-model";
import {
  actionCaseOf,
  attendanceOf,
  type CelseTimeWords,
  sessionStateOf,
  timeUntil,
} from "../session-model";
import { useCelseClock } from "../use-celse-clock";
import { minutesSince } from "../watch-model";
import { RecordingReleaseNote } from "./recording-release";

/** The meeting link opens this long before the start, as the join card's does. */
const JOIN_WINDOW_MINUTES = 10;

export interface SessionActionLabels {
  /** the eyebrows: "Canlı ders", "Yüz yüze", "Ders kaydı" */
  liveKind: string;
  inPersonKind: string;
  recordingKind: string;
  /** the poster's live mark: "Şu an canlı" */
  liveNow: string;
  ended: string;
  cancelled: string;
  /** each keeps a literal placeholder the card fills in */
  startsIn: string;
  elapsed: string;
  minutes: string;
  joinOpens: string;
  recordingTitle: string;
  recordingNotes: string;
  streamTitle: string;
  streamOpenTitle: string;
  recordingLater: string;
  /** MDRS-283: what a celse with nothing to watch now is, and how it streams */
  link: string;
  inPerson: string;
  inPersonStream: string;
  stream: string;
  noLink: string;
  streamLive: string;
  inPersonStreamLive: string;
  watchOrJoin: string;
  join: string;
  newTab: string;
  reveal: string;
  watchStream: string;
  watchRecording: string;
  noRecording: string;
  recordingPreparing: string;
  recordingsGo: string;
  cancelledTitle: string;
  cancelledJoin: string;
}

/** What the watch page plays, as the API said when the page was drawn. */
export type WatchPoster =
  | {
      kind: "recording";
      /** "YouTube", "Google Drive"; absent for a host without a name */
      provider?: string;
      durationMinutes?: number;
      /** "3 Ekim 2026" */
      recordedOn?: string;
    }
  | { kind: "stream"; provider?: string };

const releaseLine = (words: ReleaseWords) => (
  <RecordingReleaseNote words={words} />
);

/**
 * The main card of the celse detail page (MDRS-289), under its header: the
 * page's one action, on its own clock.
 *
 * - Something to watch (the stream the API sends, a READY recording open to
 *   this viewer, or a stream from the start of a page drawn before it): a
 *   16:9 poster that leads to the watch page, and "Yayını izle" / "Kaydı
 *   izle" beside it. The meeting link is the secondary button while the
 *   celse can be joined, and only here: the watch page has none (MDRS-285).
 * - Nothing to watch: the date block, and what the celse is, in MDRS-283's
 *   words, with "Takvime ekle" and the meeting link. Once it is over, what
 *   became of its recording, held ones with their "Ders kaydı … açılır"
 *   (MDRS-288).
 * - Cancelled, and locked for who may not read the course: today's words,
 *   in this frame.
 *
 * The links and the stream reach it only as the API sent them: a caller who
 * may not read the content has none of them (MDRS-103).
 */
export function SessionActionCard({
  renderedAt,
  startsAt,
  durationMinutes,
  cancelled,
  time,
  zone,
  lessonId,
  meetingUrl,
  platform,
  platformHost,
  inPerson = false,
  hasLiveStream = false,
  locale,
  watchHref,
  watch = null,
  recording = "none",
  recordingsHref,
  release,
  notesHint = false,
  calendar,
  cancellation,
  locked,
  contentLocked = false,
  labels,
}: {
  renderedAt: string;
  startsAt: string | null;
  durationMinutes?: number;
  cancelled: boolean;
  /** the date block's words, on the course's clock; absent for a celse with no time */
  time?: CelseTimeWords;
  /** "İstanbul saatiyle", under the date block when the viewer's clock shows another time */
  zone?: string | null;
  /** names the card's heading ids */
  lessonId: string;
  meetingUrl?: string;
  /** a platform id of the kit's chip */
  platform?: string;
  platformHost?: string;
  inPerson?: boolean;
  hasLiveStream?: boolean;
  locale: string;
  watchHref?: string;
  watch?: WatchPoster | null;
  /** once the celse is over with nothing to watch: none yet, still prepared, or held back (MDRS-288) */
  recording?: "none" | "preparing" | "held";
  /** "Ders kayıtlarına git", for a recording that cannot be watched yet */
  recordingsHref?: string;
  /** when a held recording opens (MDRS-288) */
  release?: ReleaseWords | null;
  /** the viewer takes notes beside the video on the watch page */
  notesHint?: boolean;
  /** "Takvime ekle", drawn by the page; shown while the celse is still ahead */
  calendar?: ReactNode;
  /** the replacement, or what happens without one, under the cancelled title */
  cancellation?: ReactNode;
  /** for who may not read the course: why, and the one thing to do about it */
  locked?: { reason: string; action?: ReactNode };
  /** the API left the content out: nothing of the recording is known */
  contentLocked?: boolean;
  labels: SessionActionLabels;
}) {
  const now = useCelseClock(renderedAt);
  const at = startsAt ? new Date(startsAt) : null;
  const state = sessionStateOf(
    {
      cancelledAt: cancelled ? new Date(0) : null,
      startsAt: at,
      durationMinutes,
    },
    now
  );
  const kind = actionCaseOf({
    state,
    locked: Boolean(locked),
    watch: watch?.kind ?? null,
    hasLiveStream,
  });
  const open = state === "upcoming" || state === "live";
  const windowOpen =
    state === "live" ||
    !at ||
    at.getTime() - now.getTime() <= JOIN_WINDOW_MINUTES * 60_000;
  const href = meetingUrl && open ? meetingUrl : undefined;
  const elapsed =
    state === "live" && at
      ? labels.elapsed.replace("{minutes}", String(minutesSince(at, now)))
      : null;

  const id = `celse-${lessonId}`;
  const eyebrowId = `${id}-eyebrow`;
  const headingId = `${id}-title`;

  // The meeting link, while the celse can be joined: a new tab, the
  // platform named beside the eyebrow, the address behind "Bağlantıyı göster".
  const joinButton = (primary: boolean) =>
    href && windowOpen ? (
      <a
        className={`mds-btn ${primary ? "mds-btn--primary" : "mds-btn--outline"} mds-btn--large mds-join__link`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {labels.join}
        <span className="mds-visually-hidden">{labels.newTab}</span>
      </a>
    ) : null;
  const reveal =
    href && windowOpen ? (
      <details className="mds-join__reveal">
        <summary>{labels.reveal}</summary>
        <p className="mds-join__url" dir="ltr">
          {href}
        </p>
      </details>
    ) : null;
  const chip =
    href && platform ? (
      <PlatformChip
        platform={platform}
        host={platform === "unknown" ? platformHost : undefined}
      />
    ) : null;
  const joinOpens =
    href && !windowOpen
      ? labels.joinOpens.replace("{minutes}", String(JOIN_WINDOW_MINUTES))
      : null;

  let media: ReactNode;
  let eyebrow: ReactNode;
  let heading: ReactNode = null;
  let line: ReactNode = null;
  let actions: ReactNode = null;
  let footnote: ReactNode = null;

  if (kind === "recording" || kind === "stream") {
    const live = kind === "stream" && state === "live";
    const poster: WatchPoster = watch ?? { kind: "stream" };
    media = (
      // A larger target for the pointer, named as the wireframe has it; the
      // button beside it is the one in the tab order.
      <a
        className="relative flex aspect-video flex-[1_1_28rem] max-inline-[40rem] items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--cover-murekkep)] text-[color:var(--text-on-cover)]"
        href={watchHref}
        tabIndex={-1}
        aria-label={
          kind === "recording" ? labels.watchRecording : labels.watchStream
        }
        data-poster={kind}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-[var(--text-on-cover)] text-[color:var(--cover-murekkep)]">
          <Icon name="play" size="lg" filled />
        </span>
        {live ? (
          <span className="mds-badge mds-badge--live absolute inset-bs-3 inset-s-3">
            <span className="mds-badge__dot" />
            {labels.liveNow}
          </span>
        ) : null}
        {poster.provider ? (
          <span className="mds-platform-chip absolute inset-be-3 inset-s-3">
            {poster.provider}
          </span>
        ) : null}
        {poster.kind === "recording" && poster.durationMinutes != null ? (
          <span className="mds-badge mds-badge--secondary mds-num absolute inset-be-3 inset-e-3">
            {labels.minutes.replace("{count}", String(poster.durationMinutes))}
          </span>
        ) : null}
      </a>
    );
    const watchButton = (
      <a className="mds-btn mds-btn--primary mds-btn--large" href={watchHref}>
        <Icon name="play" size="sm" filled />
        {kind === "recording" ? labels.watchRecording : labels.watchStream}
      </a>
    );
    actions = (
      <>
        {watchButton}
        {joinButton(false)}
      </>
    );
    if (kind === "recording") {
      eyebrow = labels.recordingKind;
      heading = labels.recordingTitle;
      // The recording's day and length, as the API has them (no "added on"
      // day exists), and where the notes are for who takes them.
      const parts = [
        poster.kind === "recording" ? poster.recordedOn : null,
        poster.kind === "recording" && poster.durationMinutes != null
          ? labels.minutes.replace("{count}", String(poster.durationMinutes))
          : null,
        notesHint ? labels.recordingNotes : null,
      ].filter((part): part is string => Boolean(part));
      line = parts.length > 0 ? joinRun(parts) : null;
      // MDRS-288: the course team plays a recording talebe may not yet.
      footnote = release ? releaseLine(release) : null;
    } else {
      eyebrow = labels.liveKind;
      heading = live ? labels.streamTitle : labels.streamOpenTitle;
      // A link beside the stream is for talking and asking; without one,
      // questions go to the stream's live chat (MDRS-283, MDRS-285).
      const what = href
        ? labels.watchOrJoin
        : live
          ? inPerson
            ? labels.inPersonStreamLive
            : labels.streamLive
          : null;
      const parts = [elapsed, what ?? joinOpens].filter(
        (part): part is string => Boolean(part)
      );
      line = parts.length > 0 ? joinRun(parts) : null;
      // MDRS-288: a talebe watches the stream while the recording is held.
      footnote = release ? releaseLine(release) : labels.recordingLater;
    }
  } else {
    media = time ? (
      <div
        className="flex flex-[0_1_16rem] flex-col justify-center gap-1 rounded-[var(--radius-control)] bg-neutral-sunken p-5"
        data-date-block=""
      >
        <span className="mds-eyebrow">{time.weekday}</span>
        <span className="mds-h1">{time.date}</span>
        <span className="mds-body mds-num">{time.clock}</span>
        {zone ? <span className="mds-caption">{zone}</span> : null}
        <span className="mds-caption pbs-1">
          {state === "upcoming" && at
            ? labels.startsIn.replace("{time}", timeUntil(at, now, locale))
            : state === "live"
              ? elapsed
              : state === "ended"
                ? labels.ended
                : labels.cancelled}
        </span>
      </div>
    ) : null;
    eyebrow = (
      <>
        {inPerson ? <Icon name="users" size="sm" /> : null}
        {inPerson ? labels.inPersonKind : labels.liveKind}
      </>
    );

    if (kind === "cancelled") {
      heading = labels.cancelledTitle;
      line = cancellation ?? null;
      footnote = labels.cancelledJoin;
    } else if (kind === "locked" && locked) {
      // Today's locked card (design tedris/19): the lock, then the way in.
      line = (
        <span className="mds-join__status mds-join__status--locked">
          {locked.reason}
        </span>
      );
      actions = locked.action ?? null;
    } else if (state === "ended") {
      if (!contentLocked) {
        eyebrow = labels.recordingKind;
        if (recording === "held" && release) {
          heading = release.text;
          line = release.zone;
        } else {
          heading =
            recording === "preparing"
              ? labels.recordingPreparing
              : labels.noRecording;
        }
      }
      actions = recordingsHref ? (
        <a
          className="mds-btn mds-btn--secondary mds-btn--large"
          href={recordingsHref}
        >
          {labels.recordingsGo}
        </a>
      ) : null;
    } else {
      const attendance = attendanceOf({
        hasLink: Boolean(meetingUrl),
        inPerson,
        hasLiveStream,
      });
      heading = labels[attendance === "none" ? "noLink" : attendance];
      line = joinOpens;
      const addToCalendar = state === "upcoming" ? (calendar ?? null) : null;
      actions =
        addToCalendar || href ? (
          <>
            {joinButton(true)}
            {addToCalendar}
          </>
        ) : null;
    }
  }

  return (
    <section
      className="mds-card flex flex-wrap items-stretch gap-6"
      aria-labelledby={heading ? headingId : eyebrowId}
      data-testid="session-action"
      data-case={kind}
    >
      {media}
      <div className="flex min-inline-0 flex-[1_1_18rem] flex-col justify-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={`mds-eyebrow flex items-center gap-2${kind === "stream" && state === "live" ? " text-live-default" : ""}`}
            id={eyebrowId}
          >
            {eyebrow}
          </p>
          {kind === "locked" || kind === "cancelled" ? null : chip}
        </div>
        {heading ? (
          <h2 className="mds-h3" id={headingId} dir="auto">
            {heading}
          </h2>
        ) : null}
        {line ? <p className="mds-body-sm text-neutral-muted">{line}</p> : null}
        {actions ? (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        ) : null}
        {kind === "locked" || kind === "cancelled" ? null : reveal}
        {footnote ? (
          <p className="mds-caption border-bs border-neutral-subtle pbs-3">
            {footnote}
          </p>
        ) : null}
      </div>
    </section>
  );
}
