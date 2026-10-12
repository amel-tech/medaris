"use client";

import type {
  CourseDetailResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { courseCover } from "~/features/courses/course-cover";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { courseActionErrorKey } from "../action-error";
import { enrollInCourse } from "../actions";
import { courseTotals, courseViewState } from "../course-view";
import type { LessonLockReason } from "../lesson-lock";
import {
  embedUrlOf,
  type ReleaseTranslate,
  recordingReleaseOf,
  releaseWordsOf,
} from "../recordings-model";
import {
  sessionActionLabels,
  sessionHeaderProps,
  stateBadgeLabels,
} from "../session-join-labels";
import { celseTimeWords, zoneLabel } from "../session-model";
import { CourseProgramme } from "./course-programme";
import { EnrollmentReceivedDialog } from "./enrollment-received-dialog";
import { MediaPlayer } from "./media-player";
import { SessionActionCard } from "./session-action-card";
import { SessionHeader } from "./session-header";
import { SessionStateBadge } from "./session-state-badge";

/**
 * Design tedris/19 — a session opened by someone who may not read it. It is
 * drawn when the API answered the course with `contentLocked`, so the page has
 * no content to leak: the meeting link, agenda, kaynak and recording never
 * reached this server. What is left is the programme the course page shows
 * anyway, with the one thing to do about it. The state is 200 with a locked
 * body, not a 403. Since MDRS-289 it has the detail page's header and its
 * main card's frame, which holds today's lock and the way in.
 */
export function LessonLocked({
  course,
  session,
  koskName,
  reason,
  signInHref,
  timeZone,
  now: nowProp,
}: {
  course: CourseDetailResponse;
  session: SessionResponse;
  koskName: string | null;
  reason: LessonLockReason;
  signInHref: string;
  /** The viewer's zone, for the card's local-time line. */
  timeZone?: string;
  /** The instant the page is drawn at, for tests. */
  now?: number;
}) {
  const t = useTranslations("tedris.LessonLocked");
  const sessionText = useTranslations("tedris.SessionPage");
  // The header and the card take the whole namespace, as on the detail page.
  const tedris = useTranslations("tedris") as unknown as LooseTranslator;
  const courseText = useTranslations("tedris.CoursePage");
  const releaseText = useTranslations("tedrisLearn.RecordingRelease");
  const locale = useLocale();
  const router = useRouter();
  const [sending, startTransition] = useTransition();
  const [now] = useState(() => nowProp ?? Date.now());
  // Design tedris/07: the window after an application that waits for approval.
  const [received, setReceived] = useState(false);
  const totals = courseTotals(course);

  const apply = () =>
    startTransition(async () => {
      const res = await enrollInCourse(course.id);
      if (sendToSignIn(res)) return;
      if (res.success === false) {
        toast.error(courseText(courseActionErrorKey(res.status)));
        return;
      }
      // The API decides whether the application waits (PENDING: the window of
      // tedris/07, then this card draws "awaiting approval") or the talebe is
      // in (ENROLLED: the refresh draws the session).
      if (res.data.status === "PENDING") setReceived(true);
      router.refresh();
    });

  const action =
    reason === "signIn" ? (
      <Button href={signInHref} size="large" fullWidth>
        {t("signIn")}
      </Button>
    ) : reason === "apply" ? (
      <Button size="large" fullWidth onClick={apply} loading={sending}>
        {t("apply")}
      </Button>
    ) : reason === "pending" ? (
      // Design tedris/18 "onay bekliyor": no button, the state and what it waits for.
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning" icon={<Icon name="clock" size="sm" />}>
          {courseText("pendingApproval")}
        </Badge>
        <span className="mds-caption">{t("pendingNote")}</span>
      </div>
    ) : undefined;

  const viewerTimeZone = timeZone ?? course.timeZone;
  const renderedAt = new Date(now).toISOString();
  const startsAt = session.startsAt?.toISOString() ?? null;
  const cancelled = Boolean(session.cancelledAt);
  const time = session.startsAt
    ? celseTimeWords(session.startsAt, session.durationMinutes, {
        locale,
        courseTimeZone: course.timeZone,
        viewerTimeZone,
      })
    : undefined;
  const teachers = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    course.muderris.map((m) => m.name)
  );

  // tedris/17 criterion 3: the one recording a locked reader may see is the
  // PUBLIC one of a sample (isPreview) session; the API leaves every other
  // recording out of the body, so whatever arrives here is already allowed.
  const recording = session.recording ?? null;
  const showRecording =
    session.status === "ENDED" && recording?.status === "READY";
  const recordingEmbed = recording
    ? embedUrlOf(recording.provider, recording.url)
    : null;
  // MDRS-288: before the release time the course team set, the API sends a
  // visitor the public recording without its link; the frame says when it
  // opens instead.
  const release = recordingReleaseOf(recording, new Date(now));
  const releaseWords = release
    ? releaseWordsOf(release, releaseText as ReleaseTranslate, {
        locale,
        courseTimeZone: course.timeZone,
        viewerTimeZone: timeZone ?? course.timeZone,
      })
    : null;
  const recordedOn = recording?.recordedAt
    ? new Intl.DateTimeFormat(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: course.timeZone,
      }).format(recording.recordedAt)
    : null;

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <SessionHeader
        {...sessionHeaderProps(tedris, {
          course,
          session,
          koskName,
          locale,
          viewerTimeZone,
        })}
        badge={
          startsAt || cancelled ? (
            <SessionStateBadge
              renderedAt={renderedAt}
              startsAt={startsAt}
              durationMinutes={session.durationMinutes ?? undefined}
              cancelled={cancelled}
              locale={locale}
              timeZone={viewerTimeZone}
              labels={stateBadgeLabels(tedris)}
            />
          ) : undefined
        }
      />

      {session.startsAt ? (
        <SessionActionCard
          renderedAt={renderedAt}
          startsAt={startsAt}
          durationMinutes={session.durationMinutes ?? undefined}
          cancelled={cancelled}
          time={time}
          zone={
            time?.local
              ? tedris("SessionPage.courseZone", {
                  zone: zoneLabel(course.timeZone, locale),
                })
              : null
          }
          lessonId={session.id}
          inPerson={session.inPerson}
          locale={locale}
          locked={{ reason: t(`description.${reason}`), action }}
          contentLocked
          labels={sessionActionLabels(tedris)}
        />
      ) : null}

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-6">
          {showRecording && recording ? (
            <MediaPlayer
              id="recording-title"
              title={recording.title}
              embedUrl={recordingEmbed}
              frameTitle={
                recording.provider === "BUNNY"
                  ? sessionText("bunnyFrameTitle", { title: recording.title })
                  : undefined
              }
              placeholder={
                releaseWords ? (
                  <>
                    {releaseWords.text}
                    {releaseWords.zone ? (
                      <>
                        {" "}
                        <span className="mds-caption block">
                          {releaseWords.zone}
                        </span>
                      </>
                    ) : null}
                  </>
                ) : (
                  sessionText("recordingPlaceholder")
                )
              }
              openHref={recordingEmbed ? null : recording.url}
              openLabel={sessionText("recordingOpen")}
            >
              {[
                sessionText("recordingKind"),
                recordedOn,
                recording.durationMinutes != null
                  ? sessionText("minutes", {
                      count: recording.durationMinutes,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </MediaPlayer>
          ) : null}
          <Card
            title={course.title}
            headingLevel={2}
            href={`/courses/${course.id}`}
            media={<CoverPattern {...courseCover(course)} size="md" />}
            footer={[
              koskName,
              sessionText("weeksCount", { count: totals.weeks }),
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {teachers ? (
              <p className="mds-body-sm" dir="auto">
                {t("teachers", { names: teachers })}
              </p>
            ) : null}
          </Card>
        </div>

        <aside
          className="flex min-inline-0 flex-col gap-3 max-md:static"
          aria-labelledby="programme"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h3" id="programme">
              {sessionText("curriculum")}
            </h2>
            <span className="mds-caption">
              {sessionText("weeksCount", { count: totals.weeks })}
            </span>
          </div>
          <CourseProgramme
            course={course}
            state={courseViewState(course, reason !== "signIn")}
            now={now}
            openWeeks={[session.weekNumber]}
          />
        </aside>
      </div>
      <EnrollmentReceivedDialog
        open={received}
        onClose={() => setReceived(false)}
        courseTitle={course.title}
      />
    </main>
  );
}
