import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { LessonRow, type LessonType } from "@medaris/ui/mds/lesson-row";
import { WeekAccordion, Weeks } from "@medaris/ui/mds/week-accordion";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { joinRun } from "../join-run";
import { buildProgramme } from "../session-model";

const LESSON_TYPES: Record<string, LessonType> = {
  VIDEO: "video",
  DOCUMENT: "document",
  LIVE: "live",
  QUIZ: "quiz",
};

/**
 * The Müfredat block of the session page: the course's weeks as the kit's
 * accordion, the current week open, each live session a row. Done weeks and
 * rows follow the clock; a cancelled session keeps its place, marked.
 */
export const SessionProgramme = async ({
  course,
  now,
}: {
  course: CourseDetailResponse;
  now: Date;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const { weeks } = buildProgramme(course, now);

  return (
    <section
      className="flex min-inline-0 flex-col gap-3"
      aria-labelledby="programme"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="mds-h3" id="programme">
          {t("SessionPage.curriculum")}
        </h2>
        <span className="mds-caption">
          {t("SessionPage.weeksCount", { count: weeks.length })}
        </span>
      </div>
      <Weeks>
        {weeks.map(({ week, state, opensOn, sessionCount, minutes, rows }) => (
          <WeekAccordion
            key={week.id}
            week={week.weekNumber}
            title={week.title}
            state={state}
            opensOn={opensOn}
            summary={week.summary ?? undefined}
            meta={
              sessionCount > 0
                ? joinRun([
                    t("SessionPage.sessionsCount", { count: sessionCount }),
                    ...(minutes > 0
                      ? [t("SessionPage.minutes", { count: minutes })]
                      : []),
                  ])
                : undefined
            }
            locale={locale}
            weekLabel={t("SessionPage.week", { number: "{week}" })}
            activeLabel={t("SessionPage.weekActive")}
            doneLabel={t("SessionPage.weekDone")}
            lockedLabel={t("SessionPage.weekLocked")}
            opensOnLabel={t("SessionPage.opensOn", { date: "{date}" })}
            emptyLabel={t("SessionPage.weekEmpty")}
          >
            {rows.map(({ lesson, state: rowState, cancelled }) => (
              <LessonRow
                key={lesson.id}
                title={lesson.title}
                type={LESSON_TYPES[lesson.type] ?? "document"}
                state={rowState}
                href={`/courses/${course.id}/lessons/${lesson.id}`}
                typeLabel={
                  lesson.type === "LIVE" ? t("SessionPage.liveType") : undefined
                }
                source={lesson.kaynak ?? undefined}
                durationMinutes={lesson.durationMinutes ?? undefined}
                startsAt={lesson.scheduledAt?.toISOString()}
                timeZone={timeZone}
                courseTimeZone={course.timeZone}
                currentLabel={t("SessionPage.rowCurrent")}
                doneLabel={t("SessionPage.rowDone")}
                localTimeLabel={t("SessionPage.localTime")}
                minuteUnit={t("SessionPage.minuteUnit")}
                locale={locale}
                trailing={
                  cancelled ? (
                    <span className="mds-badge mds-badge--outline">
                      {t("SessionPage.rowCancelled")}
                    </span>
                  ) : undefined
                }
              />
            ))}
          </WeekAccordion>
        ))}
      </Weeks>
    </section>
  );
};
