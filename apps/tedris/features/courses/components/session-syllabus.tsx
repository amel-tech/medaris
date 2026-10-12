import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { joinRun } from "../join-run";
import { type SessionState, syllabusOf } from "../session-model";

/** A row's mark: done, on air, cancelled, or still ahead. */
const Marker = ({ state }: { state: SessionState }) => (
  <span
    className="flex size-4 flex-none items-center justify-center text-neutral-subtle"
    aria-hidden="true"
  >
    {state === "ended" ? (
      <Icon name="check" size="sm" />
    ) : state === "cancelled" ? (
      <Icon name="ban" size="sm" />
    ) : state === "live" ? (
      <span className="mds-badge__dot text-live-default" />
    ) : (
      <span className="block size-2 rounded-full border border-neutral-control" />
    )}
  </span>
);

/**
 * "Müfredat" beside the celse detail page (MDRS-289): the course's celses
 * as a compact list, a window around this one, which is highlighted and
 * marked `aria-current="page"`. Each row says where it stands: done (its
 * mark, and ", sona erdi" to a screen reader), on air, cancelled, or its
 * day; this celse's row says "Kayıt var" when its recording plays, the only
 * recording the data on hand speaks of. "Bütün müfredat" leads to the
 * course page, which has every week.
 */
export const SessionSyllabus = ({
  course,
  viewingId,
  hasRecording,
  now,
  t,
  locale,
}: {
  course: CourseDetailResponse;
  viewingId: string;
  /** this celse's recording can be watched */
  hasRecording: boolean;
  now: Date;
  /** the `tedris` namespace */
  t: LooseTranslator;
  locale: string;
}) => {
  const { rows, count } = syllabusOf(course, viewingId, now);
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: course.timeZone,
  });
  return (
    <section
      className="mds-card flex flex-col gap-2"
      aria-labelledby="programme"
      data-testid="session-syllabus"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="mds-card__title" id="programme">
          {t("SessionPage.curriculum")}
        </h2>
        <span className="mds-caption">
          {joinRun([
            t("SessionPage.weeksCount", { count: course.weeks.length }),
            t("SessionPage.sessionsCount", { count }),
          ])}
        </span>
      </div>
      {rows.length > 0 ? (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map(({ lesson, weekNumber, state, viewing }) => {
            const meta = [
              t("SessionPage.week", { number: weekNumber }),
              state !== "ended" && lesson.scheduledAt
                ? day.format(lesson.scheduledAt)
                : null,
              viewing ? t("SessionPage.rowViewing") : null,
              state === "live" ? t("SessionPage.liveLabel") : null,
              state === "cancelled" ? t("SessionPage.rowCancelled") : null,
              viewing && hasRecording ? t("SessionPage.rowRecording") : null,
            ].filter((part): part is string => Boolean(part));
            const name = (
              <>
                {lesson.title}
                {state === "ended" ? (
                  <span className="mds-visually-hidden">
                    {t("SessionPage.rowDone")}
                  </span>
                ) : null}
              </>
            );
            return (
              <li
                key={lesson.id}
                className={`flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2${viewing ? " bg-neutral-sunken" : ""}`}
                data-state={state}
              >
                <Marker state={state} />
                <span className="flex min-inline-0 flex-1 flex-col gap-1">
                  {viewing ? (
                    <span className="mds-label" aria-current="page" dir="auto">
                      {name}
                    </span>
                  ) : (
                    <a
                      className="mds-body-sm"
                      href={`/courses/${course.id}/lessons/${lesson.id}`}
                      dir="auto"
                    >
                      {name}
                    </a>
                  )}
                  <span className="mds-caption">{joinRun(meta)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <a
        className="mds-btn mds-btn--link self-start"
        href={`/courses/${course.id}`}
      >
        {t("SessionPage.allCurriculum")}
      </a>
    </section>
  );
};
