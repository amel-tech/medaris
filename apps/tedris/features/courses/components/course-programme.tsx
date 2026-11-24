"use client";

import type {
  CourseDetailResponse,
  LessonResponse,
  LessonViewResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { LessonRow, type LessonType } from "@medaris/ui/mds/lesson-row";
import { WeekAccordion, Weeks } from "@medaris/ui/mds/week-accordion";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { type AssignmentViewer, assignmentMark } from "../assignment-marks";
import {
  type CourseViewState,
  hasEnded,
  heldLessons,
  holdsSeat,
  isCancelled,
  isoDateIn,
  isRunning,
  nextSession,
  weekOpensAt,
  weekState,
} from "../course-view";
import { formatOffset } from "../lesson-note-model";
import { viewsByLesson, watchMarkOf } from "../watch-progress-model";
import { ExamBadge } from "./exam-grades";

/** A row's trailing marks: the watch mark first, then the row's own. */
const withWatch = (watch: ReactNode, own: ReactNode): ReactNode =>
  watch && own ? (
    <span className="inline-flex flex-wrap items-center gap-2">
      {watch}
      {own}
    </span>
  ) : (
    (watch ?? own)
  );

/** Where the sample session's block sits on the page, for the row that points to it. */
export const SAMPLE_ANCHOR = "ornek-celse";

const KIT_TYPES: Record<string, LessonType> = {
  LIVE: "live",
  VIDEO: "video",
  DOCUMENT: "document",
  QUIZ: "quiz",
};

/**
 * The weeks of the programme (designs tedris/05, 06, 08, 12, 13). Everyone
 * sees the programme; whose lessons open is the API's call (`contentLocked`),
 * so a locked body draws locked rows and the sample session is the one row a
 * visitor can follow. A week that has not begun says when it opens.
 *
 * A celse with homework carries an "Ödev" mark, and for a talebe who has not
 * handed it in the warning "Ödev teslim edilmedi" (`assignmentMark`).
 *
 * For a seat holder each celse they have played says how far (MDRS-248, the
 * "sayaç"): "İzlendi" once watched, else the share played or where they
 * stopped (`watchMarkOf`), beside whatever other mark the row carries.
 */
export const CourseProgramme = ({
  course,
  state,
  now,
  openWeeks,
  homework = { mayHandIn: false, handedIn: null },
  views = null,
}: {
  course: CourseDetailResponse;
  state: CourseViewState;
  now: number;
  /** Weeks open at first, instead of the sample and next-session weeks. */
  openWeeks?: number[];
  /** Who looks at the homework marks, and where they handed in. */
  homework?: AssignmentViewer;
  /** The seat holder's watch records (`GET /courses/:id/lesson-views`); null draws no marks. */
  views?: readonly LessonViewResponse[] | null;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const seat = holdsSeat(state);
  const next = seat ? nextSession(course, now) : null;
  // A session on air now is the one marked "Sıradaki · Şu an canlı"
  // (design tedris/16); the one still ahead is marked only when none is.
  const running = seat
    ? (course.weeks
        .flatMap((week) => week.lessons)
        .find((lesson) => isRunning(lesson, now)) ?? null)
    : null;
  const markedId = running?.id ?? next?.lesson.id;
  const watched = seat ? viewsByLesson(views) : new Map();

  const watchBadge = (lesson: LessonResponse) => {
    const mark = watchMarkOf(watched.get(lesson.id));
    if (!mark) return null;
    return (
      <Badge
        variant={mark.kind === "watched" ? "success" : "info"}
        icon={
          <Icon name={mark.kind === "watched" ? "check" : "play"} size="sm" />
        }
        data-testid="watch-mark"
      >
        {mark.kind === "watched"
          ? t("watchedBadge")
          : mark.kind === "percent"
            ? t("watchedPercent", { percent: mark.percent })
            : t("watchedUntil", { time: formatOffset(mark.positionSeconds) })}
      </Badge>
    );
  };
  const typeLabels: Record<string, string> = {
    LIVE: t("typeLive"),
    VIDEO: t("typeVideo"),
    DOCUMENT: t("typeDocument"),
    QUIZ: t("typeQuiz"),
  };

  const rowOf = (lesson: LessonResponse, weekOpen: boolean) => {
    const open = seat && weekOpen;
    const sample = !seat && lesson.isPreview;
    const cancelled = isCancelled(lesson);
    const current = markedId === lesson.id;
    const mark = assignmentMark(lesson, homework);
    return (
      <LessonRow
        key={lesson.id}
        title={lesson.title}
        type={KIT_TYPES[lesson.type] ?? "document"}
        typeLabel={
          sample
            ? `${t("sampleMark")} · ${typeLabels[lesson.type]}`
            : typeLabels[lesson.type]
        }
        state={
          current
            ? "current"
            : (seat || sample) && !cancelled && hasEnded(lesson, now)
              ? "done"
              : "default"
        }
        access={open || sample ? "open" : "locked"}
        href={
          open
            ? `/courses/${course.id}/lessons/${lesson.id}`
            : sample
              ? `#${SAMPLE_ANCHOR}`
              : undefined
        }
        source={open || sample ? (lesson.kaynak ?? undefined) : undefined}
        durationMinutes={lesson.durationMinutes ?? undefined}
        startsAt={
          lesson.scheduledAt
            ? new Date(lesson.scheduledAt).toISOString()
            : undefined
        }
        courseTimeZone={course.timeZone}
        locale={locale}
        currentLabel={
          running?.id === lesson.id
            ? t("lessonCurrentLive")
            : t("lessonCurrent")
        }
        lockedLabel={t("lessonLocked")}
        minuteUnit={t("minuteUnit")}
        // MDRS-248: a cancelled session keeps its title as it was, beside
        // the "İptal" badge, with the müderris's note on one line and a
        // button that opens the whole of a note the line cuts.
        note={(cancelled && lesson.cancelReason?.trim()) || undefined}
        noteMoreLabel={t("cancelNoteMore")}
        noteLessLabel={t("cancelNoteLess")}
        trailing={withWatch(
          watchBadge(lesson),
          cancelled ? (
            <Badge variant="outline">{t("cancelledBadge")}</Badge>
          ) : lesson.exam ? (
            // An exam (MDRS-248) says so, with the days left while ahead.
            <ExamBadge
              isRetake={lesson.exam.isRetake}
              startsAt={lesson.scheduledAt}
              now={now}
              timeZone={course.timeZone}
            />
          ) : mark === "pending" ? (
            <Badge
              variant="warning"
              icon={<Icon name="note" size="sm" />}
              data-testid="assignment-mark"
            >
              {t("assignmentPending")}
            </Badge>
          ) : mark === "set" ? (
            <Badge
              variant="secondary"
              icon={<Icon name="note" size="sm" />}
              data-testid="assignment-mark"
            >
              {t("assignmentBadge")}
            </Badge>
          ) : undefined
        )}
      />
    );
  };

  // The sample session's week is open to everyone (design tedris/05, 06, 08):
  // it is the one week a visitor can read, and it opens at first together
  // with the week of the next session.
  const hasSample = (week: WeekResponse) =>
    !seat && week.lessons.some((lesson) => lesson.isPreview);
  const upcoming = seat ? null : nextSession(course, now);
  const openAtFirst = seat
    ? undefined
    : course.weeks
        .filter(
          (week) => hasSample(week) || week.weekNumber === upcoming?.weekNumber
        )
        .map((week) => week.weekNumber);

  return (
    <Weeks defaultOpen={openWeeks ?? openAtFirst}>
      {course.weeks.map((week) => {
        const sampleWeek = hasSample(week);
        const wState = seat
          ? weekState(week, next?.weekNumber ?? null, now)
          : sampleWeek
            ? weekState(week, null, now)
            : "default";
        const opens = weekOpensAt(week);
        const notBegun =
          seat && opens !== null && opens > now && wState === "default";
        const held = heldLessons(week.lessons);
        const minutes = held.reduce(
          (sum, l) => sum + (l.durationMinutes ?? 0),
          0
        );
        return (
          <WeekAccordion
            key={week.id}
            week={week.weekNumber}
            title={week.title}
            summary={week.summary ?? undefined}
            state={wState}
            access={seat || sampleWeek ? "open" : "locked"}
            opensOn={notBegun ? isoDateIn(opens, course.timeZone) : undefined}
            meta={t("weekMeta", { count: held.length, minutes })}
            locale={locale}
            weekLabel={t("week", { number: "{week}" })}
            activeLabel={t("weekActive")}
            doneLabel={t("weekEnded")}
            lockedLabel={t("lockedMark")}
            opensOnLabel={t.raw("weekOpensOn") as string}
          >
            {week.lessons.map((lesson) => rowOf(lesson, !notBegun))}
          </WeekAccordion>
        );
      })}
    </Weeks>
  );
};
