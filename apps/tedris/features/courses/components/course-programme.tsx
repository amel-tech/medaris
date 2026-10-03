"use client";

import type {
  CourseDetailResponse,
  LessonResponse,
  WeekResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { LessonRow, type LessonType } from "@medaris/ui/mds/lesson-row";
import { WeekAccordion, Weeks } from "@medaris/ui/mds/week-accordion";
import { useLocale, useTranslations } from "next-intl";
import {
  type CourseViewState,
  hasEnded,
  heldLessons,
  holdsSeat,
  isCancelled,
  isoDateIn,
  nextSession,
  weekOpensAt,
  weekState,
} from "../course-view";

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
 */
export const CourseProgramme = ({
  course,
  state,
  now,
}: {
  course: CourseDetailResponse;
  state: CourseViewState;
  now: number;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const locale = useLocale();
  const seat = holdsSeat(state);
  const next = seat ? nextSession(course, now) : null;
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
    const current = next?.lesson.id === lesson.id;
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
        currentLabel={t("lessonCurrent")}
        lockedLabel={t("lessonLocked")}
        minuteUnit={t("minuteUnit")}
        trailing={
          cancelled ? (
            <Badge variant="outline">{t("cancelledBadge")}</Badge>
          ) : undefined
        }
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
    <Weeks defaultOpen={openAtFirst}>
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
