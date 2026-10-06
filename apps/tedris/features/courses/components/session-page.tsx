import type {
  CourseDetailResponse,
  SessionRefResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Card } from "@medaris/ui/mds/card";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { resolveMeetingPlatform } from "@medaris/utils";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { canWriteNotes } from "../lesson-note-model";
import {
  embedUrlOf,
  liveEmbedUrlOf,
  playerApiUrlOf,
  recordingsTabPath,
} from "../recordings-model";
import {
  calendarLabels,
  hostOf,
  sessionJoinLabels,
} from "../session-join-labels";
import { splitArabic, zoneLabel } from "../session-model";
import { CourseResources } from "./course-resources";
import { LessonNotes } from "./lesson-notes";
import { LiveChat } from "./live-chat";
import { MediaPlayer } from "./media-player";
import { PlayerWithNotes } from "./player-with-notes";
import { SessionJoinLive } from "./session-join-live";
import { SessionProgramme } from "./session-programme";

// Narrow on purpose: the full translator type hits TS2589 here (MDRS-176).
type Translate = LooseTranslator;

/** A line with each Arabic run set in its own language and direction. */
const ArabicText = ({ text }: { text: string }) => (
  <>
    {splitArabic(text).map((part, i) =>
      part.arabic ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one static string, never reordered
        <span key={i} lang="ar" dir="rtl" className="mds-arabic">
          {part.text}
        </span>
      ) : (
        // biome-ignore lint/suspicious/noArrayIndexKey: runs of one static string, never reordered
        <span key={i}>{part.text}</span>
      )
    )}
  </>
);

const NeighbourCard = ({
  session,
  direction,
  href,
  t,
  locale,
  courseTimeZone,
}: {
  session: SessionRefResponse;
  direction: "previous" | "next";
  href: string;
  t: Translate;
  locale: string;
  courseTimeZone: string;
}) => {
  const previous = direction === "previous";
  const when = session.startsAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: courseTimeZone,
      }).format(session.startsAt)
    : null;
  return (
    <div
      className="mds-card mds-card--interactive flex flex-col gap-2"
      data-density="compact"
    >
      <p
        className={`mds-eyebrow flex items-center gap-1 ${previous ? "" : "justify-end"}`}
        aria-hidden="true"
      >
        {previous ? <Icon name="arrowLeft" size="sm" /> : null}
        {t(previous ? "SessionPage.previous" : "SessionPage.next")}
        {previous ? null : <Icon name="arrowRight" size="sm" />}
      </p>
      <div className="mds-card__header">
        <p
          className={`mds-card__title ${previous ? "" : "text-end"}`}
          dir="auto"
        >
          <a className="mds-card__link" href={href}>
            <span className="mds-visually-hidden">
              {t(previous ? "SessionPage.previousSr" : "SessionPage.nextSr")}
            </span>
            {session.title}
          </a>
        </p>
      </div>
      <div className={`mds-card__footer ${previous ? "" : "text-end"}`}>
        <span>
          <span>{t("SessionPage.week", { number: session.weekNumber })}</span>
          {when ? (
            <span className="mds-sep" aria-hidden="true">
              ·
            </span>
          ) : null}
        </span>
        {when ? (
          <span>
            <time dateTime={session.startsAt?.toISOString()}>{when}</time>
          </span>
        ) : null}
      </div>
    </div>
  );
};

/**
 * The session page (MDRS-158, designs tedris/15 and 18): a live celse of a
 * course the viewer may read. Server component; the only client piece is the
 * join card, which keeps a clock. `session` is `GET /courses/:id/sessions/:id`
 * — its status, cancellation, replacement and neighbours are the API's; the
 * course is the programme the aside lists.
 */
export const SessionPage = async ({
  course,
  session,
  koskName,
  now,
}: {
  course: CourseDetailResponse;
  session: SessionResponse;
  koskName: string | null;
  now: Date;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const cancelled = session.status === "CANCELLED";
  const lessonHref = (id: string) => `/courses/${course.id}/lessons/${id}`;
  const meetingUrl = session.meetingUrl || undefined;
  const platform = meetingUrl ? resolveMeetingPlatform(meetingUrl) : null;
  const replacement = cancelled ? session.replacement : null;
  const replacementAt = replacement?.startsAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: course.timeZone,
      }).format(replacement.startsAt)
    : null;
  const agenda = session.agenda ?? [];
  const kaynak = session.kaynak?.trim() || null;

  // MDRS-162: the recording of a finished celse and the stream of a live one
  // are content the API sends only to who may read it, so a body without them
  // draws neither. A Bunny recording's address is the player link the API
  // signed for this viewer in this response (MDRS-114).
  const recording = session.recording ?? null;
  const recordingEmbed = recording
    ? embedUrlOf(recording.provider, recording.url)
    : null;
  const showRecording =
    session.status === "ENDED" && recording?.status === "READY";
  const liveStream = session.status === "LIVE" ? session.liveStreamUrl : null;
  const liveEmbed = liveEmbedUrlOf(liveStream);
  // MDRS-150: an enrolled talebe takes private notes on the video on screen,
  // the stream while it is live and the recording once it is up. The frames
  // get the player API only then, so every other viewer's page is unchanged.
  const mayTakeNotes =
    !session.contentLocked && canWriteNotes(course.enrollment?.status);
  const noteFrame = (framed: string | null, frameId: string) =>
    mayTakeNotes && framed
      ? { embedUrl: playerApiUrlOf(framed), frameId }
      : { embedUrl: framed, frameId: undefined };
  const liveFrame = noteFrame(liveEmbed, "live-stream-frame");
  const recordingFrame = noteFrame(recordingEmbed, "recording-frame");
  const notesVideo =
    liveStream && liveEmbed
      ? { frameId: "live-stream-frame", framed: liveEmbed }
      : showRecording
        ? { frameId: "recording-frame", framed: recordingEmbed }
        : null;
  // The panel goes under the video it is about (MDRS-280), never further down
  // the page.
  const notesUnder = (frameId: string) =>
    mayTakeNotes && notesVideo?.frameId === frameId ? (
      <LessonNotes
        lessonId={session.id}
        // Only a YouTube frame reports a position; anything else is typed.
        frameId={
          notesVideo.framed?.startsWith("https://www.youtube-nocookie.com/")
            ? frameId
            : null
        }
      />
    ) : null;
  const recordedOn = recording?.recordedAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: course.timeZone,
      }).format(recording.recordedAt)
    : null;

  const crumbs: { label: string; href?: string }[] = [];
  if (koskName)
    crumbs.push({ label: koskName, href: `/kosks/${course.koskId}` });
  crumbs.push({ label: course.title, href: `/courses/${course.id}` });
  crumbs.push({ label: session.title });

  const calendar =
    !session.contentLocked && session.startsAt ? calendarLabels(t) : undefined;

  const join: ReactNode = session.startsAt ? (
    <SessionJoinLive
      renderedAt={now.toISOString()}
      startsAt={session.startsAt.toISOString()}
      durationMinutes={session.durationMinutes ?? undefined}
      cancelled={cancelled}
      title={session.title}
      courseId={course.id}
      courseTitle={course.title}
      lessonId={session.id}
      meetingUrl={meetingUrl}
      platform={platform?.id}
      platformHost={meetingUrl ? hostOf(meetingUrl) : undefined}
      locale={locale}
      timeZone={timeZone}
      courseTimeZone={course.timeZone}
      calendar={calendar}
      recordingsHref={recording ? recordingsTabPath(course.id) : undefined}
      labels={sessionJoinLabels(t)}
    />
  ) : null;

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-inline-0 flex-col gap-4">
          <Breadcrumb items={crumbs} label={t("SessionPage.breadcrumb")} />
          <div className="flex min-inline-0 flex-col gap-2">
            <p className="mds-eyebrow">
              {t("SessionPage.week", { number: session.weekNumber })}
            </p>
            <h1 className="mds-h1" dir="auto">
              {session.title}
            </h1>
            {/* MDRS-279: the session's source line ("Bina · s. 4–9"). It is
                content: the API sends it only to who may read it, and to
                everyone for the sample session (MDRS-161). */}
            {kaynak ? (
              <p
                className="mds-body-sm flex flex-wrap items-baseline gap-x-2"
                data-testid="session-kaynak"
              >
                <span className="mds-eyebrow">{t("SessionPage.kaynak")}</span>
                <span dir="auto">
                  <ArabicText text={kaynak} />
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* MDRS-280: a finished session's recording takes the page's whole
          width, above the join card and the aside, with the talebe's notes
          under it. A live stream stays in the column after the join card, so
          "Celseye katıl" is not pushed under a page-wide video. */}
      {showRecording && recording ? (
        <PlayerWithNotes
          player={
            <MediaPlayer
              id="recording-title"
              title={recording.title}
              embedUrl={recordingFrame.embedUrl}
              frameId={recordingFrame.frameId}
              frameTitle={
                recording.provider === "BUNNY"
                  ? t("SessionPage.bunnyFrameTitle", {
                      title: recording.title,
                    })
                  : undefined
              }
              placeholder={t("SessionPage.recordingPlaceholder")}
              openHref={recordingEmbed ? null : recording.url}
              openLabel={t("SessionPage.recordingOpen")}
            >
              {[
                t("SessionPage.recordingKind"),
                recordedOn,
                recording.durationMinutes != null
                  ? t("SessionPage.minutes", {
                      count: recording.durationMinutes,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </MediaPlayer>
          }
          notes={notesUnder("recording-frame")}
        />
      ) : null}

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-section">
          {cancelled ? (
            <Alert tone="neutral" title={t("SessionPage.cancelledTitle")}>
              {replacement && replacementAt ? (
                <>
                  {t.rich("SessionPage.replacement", {
                    time: replacementAt,
                    when: (chunks) => (
                      <time dateTime={replacement.startsAt?.toISOString()}>
                        {chunks}
                      </time>
                    ),
                  })}{" "}
                  <a
                    className="mds-btn mds-btn--link"
                    href={lessonHref(replacement.id)}
                  >
                    {t("SessionPage.replacementGo")}
                  </a>
                </>
              ) : (
                t("SessionPage.noReplacement")
              )}
            </Alert>
          ) : null}

          {session.status === "ENDED" &&
          !recording &&
          !session.contentLocked ? (
            // Design tedris/17 "ders kaydı yok": the place the recording will take.
            <Card title={t("SessionPage.recordingCardTitle")} headingLevel={2}>
              <EmptyState icon={<Icon name="playCircle" />}>
                {t("SessionPage.noRecording")}
              </EmptyState>
            </Card>
          ) : null}

          <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
            {join}
            {agenda.length > 0 ? (
              <section
                className="mds-card flex flex-col gap-3"
                aria-labelledby="agenda-title"
              >
                <div className="mds-card__header">
                  <h2 className="mds-card__title" id="agenda-title">
                    {t("SessionPage.agendaTitle")}
                  </h2>
                </div>
                <p className="mds-caption">
                  {t("SessionPage.agendaZone", {
                    zone: zoneLabel(course.timeZone, locale),
                  })}
                </p>
                <ol className="m-0 flex list-none flex-col p-0">
                  {agenda.map((step, i) => (
                    <li
                      // biome-ignore lint/suspicious/noArrayIndexKey: the agenda is a fixed ordered list of one response
                      key={i}
                      className="flex items-baseline gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                    >
                      <span className="mds-caption mds-num min-inline-12">
                        {step.time}
                      </span>
                      <span className="flex min-inline-0 flex-1 flex-col">
                        <span className="mds-body-sm" dir="auto">
                          <ArabicText text={step.title} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          {liveStream ? (
            <PlayerWithNotes
              player={
                <MediaPlayer
                  id="live-stream-title"
                  title={t("SessionPage.liveStreamTitle")}
                  embedUrl={liveFrame.embedUrl}
                  frameId={liveFrame.frameId}
                  placeholder={t("SessionPage.liveStreamPlaceholder")}
                  openHref={liveEmbed ? null : liveStream}
                  openLabel={t("SessionPage.liveStreamOpen")}
                >
                  {t("SessionPage.liveStreamText")}
                </MediaPlayer>
              }
              notes={notesUnder("live-stream-frame")}
            />
          ) : null}

          {liveStream && liveEmbed ? <LiveChat streamUrl={liveStream} /> : null}

          {session.previous || session.next ? (
            <nav
              className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]"
              aria-label={t("SessionPage.neighbours")}
            >
              {session.previous ? (
                <NeighbourCard
                  session={session.previous}
                  direction="previous"
                  href={lessonHref(session.previous.id)}
                  t={t}
                  locale={locale}
                  courseTimeZone={course.timeZone}
                />
              ) : (
                <span />
              )}
              {session.next ? (
                <NeighbourCard
                  session={session.next}
                  direction="next"
                  href={lessonHref(session.next.id)}
                  t={t}
                  locale={locale}
                  courseTimeZone={course.timeZone}
                />
              ) : null}
            </nav>
          ) : null}
        </div>

        <aside
          className="sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] flex flex-col gap-4 max-md:static"
          aria-label={t("SessionPage.side")}
        >
          {session.muderris.length > 0 ? (
            <Card title={t("SessionPage.muderris")} headingLevel={2}>
              <ul className="m-0 flex list-none flex-col p-0 mbs-6">
                {session.muderris.map((m) => (
                  <li
                    key={m.name}
                    className="flex items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                  >
                    <Avatar name={m.name} decorative />
                    <span className="flex min-inline-0 flex-1 flex-col">
                      <span className="mds-label" dir="auto">
                        {m.name}
                      </span>
                    </span>
                    {m.isImam ? (
                      <span className="mds-badge mds-badge--secondary">
                        {t("SessionPage.imam")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <CourseResources
            resources={course.resources}
            locked={course.contentLocked}
            labels={{
              title: t("SessionPage.resourcesTitle"),
              newTab: t("SessionPage.newTab"),
              locked: t("SessionPage.resourcesLocked"),
            }}
          />
          <SessionProgramme course={course} now={now} viewingId={session.id} />
        </aside>
      </div>
    </main>
  );
};
