import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { resolveMeetingPlatform } from "@medaris/utils";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { canWriteNotes } from "../lesson-note-model";
import {
  liveEmbedUrlOf,
  RECORDING_PROVIDER_NAMES,
  type ReleaseTranslate,
  recordingReleaseOf,
  recordingsTabPath,
  releaseWordsOf,
} from "../recordings-model";
import {
  calendarLabels,
  hostOf,
  sessionActionLabels,
  sessionHeaderProps,
  stateBadgeLabels,
} from "../session-join-labels";
import { celseTimeWords, zoneLabel } from "../session-model";
import { watchPath, watchTargetOf } from "../watch-model";
import { CalendarMenu } from "./calendar-menu";
import { FileErrorNotice } from "./file-error-notice";
import { LessonNotes } from "./lesson-notes";
import { SessionActionCard, type WatchPoster } from "./session-action-card";
import { SessionAgenda } from "./session-agenda";
import { SessionHeader } from "./session-header";
import { SessionHomework } from "./session-homework";
import { SessionPager } from "./session-pager";
import { hasSessionResources, SessionResources } from "./session-resources";
import { SessionStateBadge } from "./session-state-badge";

/**
 * The celse detail page (MDRS-158, MDRS-285; layout MDRS-289): a live celse
 * of a course the viewer may read. Server component; the client pieces keep
 * a clock (the state badge, the main card, the agenda, the notes) or open
 * (the Müfredat combobox). `session` is `GET /courses/:id/sessions/:id`: its
 * status, cancellation, replacement and neighbours are the API's; the
 * course is the programme the Müfredat lists.
 *
 * One column, from the top: the header (Köşk › Ders › Hafta N, the title,
 * where the celse stands, its time and its müderris); one wide card, the
 * page's main action (the way to the watch page, or the date and how the
 * celse is attended, with the meeting link); "Notlarım" when there is
 * nothing to watch; "Ödevim" for a talebe who may hand in (MDRS-290);
 * "Gündem" and "Kaynaklar" side by side, either alone across the width;
 * last, the previous celse, the Müfredat and the next.
 * The owner: "hep önce-müfredat-sonra şeklinde olabilir, kaynaklar ve gündem
 * gibi diğer detaylar bunların üstünde olur". A phone stacks the two cards.
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
  const fileErrors = await getTranslations("tedrisLearn.FileDownload");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const cancelled = session.status === "CANCELLED";
  const lessonHref = (id: string) =>
    `/${locale}/courses/${course.id}/lessons/${id}`;
  const meetingUrl = session.meetingUrl || undefined;
  const platform = meetingUrl ? resolveMeetingPlatform(meetingUrl) : null;
  const replacement = cancelled ? session.replacement : null;
  const agenda = session.agenda ?? [];
  const kaynak = session.kaynak?.trim() || null;
  const renderedAt = now.toISOString();
  const startsAt = session.startsAt?.toISOString() ?? null;
  const durationMinutes = session.durationMinutes ?? undefined;

  // MDRS-285: the stream and the recording play on the celse's watch page,
  // with the chat or the questions and the notes beside them; this page
  // only leads there. Both are content the API sends only to who may read it
  // (MDRS-162), so a body without them offers no way there.
  const recording = session.recording ?? null;
  const target = watchTargetOf(session);
  const watch: WatchPoster | null =
    target?.kind === "recording"
      ? {
          kind: "recording",
          provider: RECORDING_PROVIDER_NAMES[target.recording.provider],
          durationMinutes: target.recording.durationMinutes ?? undefined,
          recordedOn: target.recording.recordedAt
            ? new Intl.DateTimeFormat(locale, {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: course.timeZone,
              }).format(target.recording.recordedAt)
            : undefined,
        }
      : target?.kind === "stream"
        ? {
            kind: "stream",
            provider: liveEmbedUrlOf(target.url) ? "YouTube" : undefined,
          }
        : null;
  // MDRS-288: a recording the course team holds back until a time says when
  // it opens: to a talebe, who has no link to it yet, and to the course team,
  // who play it already. The time is the course's, the viewer's clock beside.
  const release = recordingReleaseOf(recording, now);
  const releaseWords = release
    ? releaseWordsOf(
        release,
        (await getTranslations(
          "tedrisLearn.RecordingRelease"
        )) as ReleaseTranslate,
        { locale, courseTimeZone: course.timeZone, viewerTimeZone: timeZone }
      )
    : null;
  // MDRS-266: an enrolled talebe takes private notes on every celse that
  // stands, before it starts as well. Where a video can be watched now the
  // panel is beside it on the watch page; with none it leads the page's
  // column, and the celse's clock gives a note's time while it is live.
  const mayTakeNotes =
    !session.contentLocked && canWriteNotes(course.enrollment?.status);
  const notes =
    mayTakeNotes && !cancelled && !target ? (
      <LessonNotes
        lessonId={session.id}
        frameId={null}
        clock={{
          startsAt,
          durationMinutes,
          renderedAt,
        }}
      />
    ) : null;

  // MDRS-290: the talebe's homework on the celse, on the same terms as the
  // notes (enrolled or completed, the content open, the celse standing),
  // whether or not there is a video to watch: the watch page is for watching.
  // It comes after the notes and before Gündem and Kaynaklar.
  const homework =
    mayTakeNotes && !cancelled ? (
      <SessionHomework lessonId={session.id} />
    ) : null;

  const cancellation: ReactNode = cancelled ? (
    replacement?.startsAt ? (
      <>
        {t.rich("SessionPage.replacement", {
          time: new Intl.DateTimeFormat(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: course.timeZone,
          }).format(replacement.startsAt),
          when: (chunks) => (
            <time dateTime={replacement.startsAt?.toISOString()}>{chunks}</time>
          ),
        })}{" "}
        <a className="mds-btn mds-btn--link" href={lessonHref(replacement.id)}>
          {t("SessionPage.replacementGo")}
        </a>
      </>
    ) : (
      t("SessionPage.noReplacement")
    )
  ) : null;

  const time = session.startsAt
    ? celseTimeWords(session.startsAt, session.durationMinutes, {
        locale,
        courseTimeZone: course.timeZone,
        viewerTimeZone: timeZone,
      })
    : undefined;

  // A celse with no time and nothing to watch has no card, as before.
  const card =
    session.startsAt || target || cancelled ? (
      <SessionActionCard
        renderedAt={renderedAt}
        startsAt={startsAt}
        durationMinutes={durationMinutes}
        cancelled={cancelled}
        time={time}
        zone={
          time?.local
            ? t("SessionPage.courseZone", {
                zone: zoneLabel(course.timeZone, locale),
              })
            : null
        }
        lessonId={session.id}
        meetingUrl={meetingUrl}
        platform={platform?.id}
        platformHost={meetingUrl ? hostOf(meetingUrl) : undefined}
        // MDRS-283: without a link the card says the celse is streamed or held
        // in person. `hasLiveStream` comes before the start, the link from the
        // start; a caller who may not read the content gets neither.
        inPerson={session.inPerson}
        hasLiveStream={session.hasLiveStream ?? Boolean(session.liveStreamUrl)}
        locale={locale}
        // MDRS-285: "Yayını izle" or "Kaydı izle", to the watch page.
        watchHref={`/${locale}${watchPath(course.id, session.id)}`}
        watch={watch}
        recording={
          !recording ? "none" : release?.kind === "held" ? "held" : "preparing"
        }
        recordingsHref={
          recording ? `/${locale}${recordingsTabPath(course.id)}` : undefined
        }
        release={releaseWords}
        notesHint={mayTakeNotes}
        calendar={
          !session.contentLocked && startsAt ? (
            <CalendarMenu
              text
              size="large"
              className="mds-btn--outline"
              courseId={course.id}
              courseTitle={course.title}
              lesson={{
                id: session.id,
                title: session.title,
                startsAt,
                durationMinutes,
              }}
              locale={locale}
              labels={calendarLabels(t)}
            />
          ) : undefined
        }
        cancellation={cancellation}
        contentLocked={session.contentLocked}
        labels={sessionActionLabels(t)}
      />
    ) : null;

  // "Gündem" and "Kaynaklar" share a row, each half; either alone takes it.
  const details = [
    agenda.length > 0 ? (
      <SessionAgenda
        key="agenda"
        agenda={agenda}
        renderedAt={renderedAt}
        startsAt={startsAt}
        durationMinutes={durationMinutes}
        courseTimeZone={course.timeZone}
        labels={{
          title: t("SessionPage.agendaTitle"),
          zone: t("SessionPage.agendaZone", {
            zone: zoneLabel(course.timeZone, locale),
          }),
          now: t("SessionPage.agendaNow"),
        }}
      />
    ) : null,
    hasSessionResources(kaynak, session.resources, course.resources) ? (
      <SessionResources
        key="resources"
        kaynak={kaynak}
        own={session.resources}
        ownLocked={session.contentLocked}
        course={course.resources}
        courseLocked={course.contentLocked}
        labels={{
          title: t("SessionPage.resourcesTitle"),
          reading: t("SessionPage.readingPlace"),
          own: t("SessionPage.resourcesOwn"),
          course: t("SessionPage.resourcesCourse"),
          newTab: t("SessionPage.newTab"),
          download: t("SessionPage.download"),
          locked: t("SessionPage.resourcesLocked"),
        }}
        locale={locale}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <FileErrorNotice
        labels={{
          title: fileErrors("title"),
          forbidden: fileErrors("forbidden"),
          notFound: fileErrors("notFound"),
          unavailable: fileErrors("unavailable"),
          failed: fileErrors("failed"),
        }}
      />
      <SessionHeader
        {...sessionHeaderProps(t, {
          course,
          session,
          koskName,
          locale,
          viewerTimeZone: timeZone,
        })}
        badge={
          startsAt || cancelled ? (
            <SessionStateBadge
              renderedAt={renderedAt}
              startsAt={startsAt}
              durationMinutes={durationMinutes}
              cancelled={cancelled}
              locale={locale}
              timeZone={timeZone}
              labels={stateBadgeLabels(t)}
            />
          ) : undefined
        }
      />

      {card}

      {notes}

      {homework}

      {details.length > 0 ? (
        <div
          className={`grid gap-grid${details.length > 1 ? " grid-cols-2 max-md:grid-cols-1" : ""}`}
          data-testid="session-details"
        >
          {details}
        </div>
      ) : null}

      <SessionPager
        course={course}
        session={session}
        now={now}
        hasRecording={target?.kind === "recording"}
        t={t}
        locale={locale}
      />
    </main>
  );
};
