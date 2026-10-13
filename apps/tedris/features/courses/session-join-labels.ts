import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import type { ImamStarLabels } from "@medaris/ui/lib/imam-star";
import type { LooseTranslator } from "~/lib/i18n/loose";
import type { SessionActionLabels } from "./components/session-action-card";
import type { SessionHeader } from "./components/session-header";
import type {
  CalendarLabels,
  SessionJoinLabels,
} from "./components/session-join-live";
import type { SessionStateBadgeLabels } from "./components/session-state-badge";
import { celseNumberOf, celseTimeWords, zoneLabel } from "./session-model";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/** The join card's words on Ana sayfa (`t` is the `tedris` namespace). */
export const sessionJoinLabels = (t: Translate): SessionJoinLabels => ({
  label: t("SessionPage.joinLabel"),
  liveLabel: t("SessionPage.liveLabel"),
  endedLabel: t("SessionPage.endedLabel"),
  cancelledLabel: t("SessionPage.cancelledLabel"),
  cancelledText: t("SessionPage.cancelledJoinText"),
  noLinkText: t("SessionPage.noLinkText"),
  inPersonText: t("SessionPage.inPersonText"),
  streamText: t("SessionPage.streamText"),
  streamLiveText: t("SessionPage.streamLiveText"),
  inPersonStreamText: t("SessionPage.inPersonStreamText"),
  inPersonStreamLiveText: t("SessionPage.inPersonStreamLiveText"),
  joinOpensText: t("SessionPage.joinOpensText", { minutes: "{minutes}" }),
  joinLabel: t("SessionPage.joinAction"),
  newTabLabel: t("SessionPage.newTab"),
  revealLabel: t("SessionPage.reveal"),
  localTimeLabel: t("SessionPage.localTime"),
  minuteUnit: t("SessionPage.minuteUnit"),
  elapsedText: t("SessionPage.elapsed", { minutes: "{minutes}" }),
});

/** The main card's words on the celse detail page (MDRS-289). */
export const sessionActionLabels = (t: Translate): SessionActionLabels => ({
  liveKind: t("SessionPage.joinLabel"),
  inPersonKind: t("SessionPage.inPersonKind"),
  recordingKind: t("SessionPage.recordingKind"),
  liveNow: t("SessionPage.liveLabel"),
  ended: t("SessionPage.endedLabel"),
  cancelled: t("SessionPage.cancelledLabel"),
  startsIn: t("SessionPage.startsIn", { time: "{time}" }),
  elapsed: t("SessionPage.elapsed", { minutes: "{minutes}" }),
  minutes: t("SessionPage.minutes", { count: "{count}" }),
  joinOpens: t("SessionPage.joinOpensText", { minutes: "{minutes}" }),
  recordingTitle: t("SessionPage.recordingTitle"),
  recordingNotes: t("SessionPage.recordingNotes"),
  streamTitle: t("SessionPage.streamTitle"),
  streamOpenTitle: t("SessionPage.streamOpenTitle"),
  recordingLater: t("SessionPage.recordingLater"),
  link: t("SessionPage.linkText"),
  inPerson: t("SessionPage.inPersonText"),
  inPersonStream: t("SessionPage.inPersonStreamText"),
  stream: t("SessionPage.streamText"),
  noLink: t("SessionPage.noLinkText"),
  streamLive: t("SessionPage.streamLiveText"),
  inPersonStreamLive: t("SessionPage.inPersonStreamLiveText"),
  watchOrJoin: t("SessionPage.watchOrJoin"),
  join: t("SessionPage.joinMeeting"),
  newTab: t("SessionPage.newTab"),
  reveal: t("SessionPage.reveal"),
  watchStream: t("SessionPage.watchStream"),
  watchRecording: t("SessionPage.watchRecording"),
  noRecording: t("SessionPage.noRecording"),
  recordingPreparing: t("SessionPage.recordingPreparing"),
  recordingsGo: t("SessionPage.recordingsGo"),
  cancelledTitle: t("SessionPage.cancelledTitle"),
  cancelledJoin: t("SessionPage.cancelledJoinText"),
});

/** The header badge's words (MDRS-289). */
export const stateBadgeLabels = (t: Translate): SessionStateBadgeLabels => ({
  live: t("SessionPage.liveBadge", { minutes: "{minutes}" }),
  ended: t("SessionPage.endedLabel"),
  cancelled: t("SessionPage.cancelledLabel"),
});

/**
 * The header of a celse's page (MDRS-289) for the detail page and the
 * locked one alike, all but the badge, which keeps its own clock: Köşk ›
 * Ders › Hafta N, "Hafta N · K. celse", and the meta line on the course's
 * clock with the viewer's beside it when it shows another time.
 */
export const sessionHeaderProps = (
  t: Translate,
  {
    course,
    session,
    koskName,
    locale,
    viewerTimeZone,
    imamStar,
  }: {
    course: CourseDetailResponse;
    session: SessionResponse;
    koskName: string | null;
    locale: string;
    viewerTimeZone: string;
    /** the star's words (`common.imamStar`), which `t` cannot reach */
    imamStar: ImamStarLabels;
  }
): Omit<Parameters<typeof SessionHeader>[0], "badge"> => {
  const week = t("SessionPage.week", { number: session.weekNumber });
  const crumbs: { label: string; href?: string }[] = [];
  if (koskName)
    crumbs.push({ label: koskName, href: `/${locale}/kosks/${course.koskId}` });
  crumbs.push({ label: course.title, href: `/${locale}/courses/${course.id}` });
  crumbs.push({ label: week });
  const number = celseNumberOf(course, session.id);
  const words = session.startsAt
    ? celseTimeWords(session.startsAt, session.durationMinutes, {
        locale,
        courseTimeZone: course.timeZone,
        viewerTimeZone,
      })
    : null;
  return {
    crumbs,
    breadcrumbLabel: t("SessionPage.breadcrumb"),
    eyebrow:
      number === null
        ? week
        : t("SessionPage.weekCelse", { week: session.weekNumber, number }),
    title: session.title,
    when:
      words && session.startsAt
        ? {
            dateTime: session.startsAt.toISOString(),
            text: `${words.day} · ${words.clock}`,
            zone: t("SessionPage.courseZone", {
              zone: zoneLabel(course.timeZone, locale),
            }),
            local: words.local
              ? t("SessionTime.yourTime", { time: words.local })
              : null,
          }
        : undefined,
    length:
      session.durationMinutes != null
        ? t("SessionPage.minutes", { count: session.durationMinutes })
        : null,
    muderris: session.muderris,
    imamStar,
  };
};

/**
 * The card's sentences for a celse without a link, where the card is not on
 * the session page (Ana sayfa): the stream and the recording are on the
 * session page, not "here" (MDRS-283). The same words as Programım's rows.
 */
export const elsewhereJoinLabels = (
  t: Translate
): Pick<
  SessionJoinLabels,
  | "noLinkText"
  | "inPersonText"
  | "streamText"
  | "streamLiveText"
  | "inPersonStreamText"
  | "inPersonStreamLiveText"
> => ({
  noLinkText: t("SchedulePage.noLink"),
  inPersonText: t("SchedulePage.inPerson"),
  streamText: t("SchedulePage.stream"),
  streamLiveText: t("SchedulePage.streamLive"),
  inPersonStreamText: t("SchedulePage.inPersonStream"),
  inPersonStreamLiveText: t("SchedulePage.inPersonStreamLive"),
});

/** "Takvime ekle" and its menu. */
export const calendarLabels = (t: Translate): CalendarLabels => ({
  button: t("AddToCalendar.button"),
  google: t("AddToCalendar.google"),
  apple: t("AddToCalendar.apple"),
  downloadFailed: t("AddToCalendar.downloadFailed"),
  subscribe: t("AddToCalendar.subscribe"),
  note: t("AddToCalendar.note"),
  linkIsOnPage: t("AddToCalendar.linkIsOnPage"),
});

/** The host a meeting link points at, for the chip of an unknown platform. */
export const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return undefined;
  }
};
