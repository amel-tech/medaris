import type {
  CourseDetailResponse,
  SessionRefResponse,
  SessionResponse,
} from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { joinRun } from "../join-run";
import { curriculumOf } from "../session-model";
import { type CurriculumOption, SessionCurriculum } from "./session-curriculum";

const lessonHref = (courseId: string, id: string) =>
  `/courses/${courseId}/lessons/${id}`;

/**
 * One end of the bottom row: the previous celse at the start, the next at
 * the end. The kit's clickable card, one link in its title; as tall as the
 * Müfredat button beside it, with the same three lines: "Önceki · Hafta 4",
 * the title on one line, its day and time (and "Şu an canlı" or "İptal
 * edildi" when the API says so).
 */
const NeighbourCard = ({
  session,
  direction,
  href,
  narrow,
  t,
  locale,
  courseTimeZone,
}: {
  session: SessionRefResponse;
  direction: "previous" | "next";
  href: string;
  /** beside the Müfredat button, which takes the rest of the row */
  narrow: boolean;
  t: LooseTranslator;
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
  const state =
    session.status === "LIVE"
      ? t("SessionPage.liveLabel")
      : session.status === "CANCELLED"
        ? t("SessionPage.rowCancelled")
        : null;
  const line = [
    when ? (
      <time key="when" dateTime={session.startsAt?.toISOString()}>
        {when}
      </time>
    ) : null,
    state,
  ].filter(Boolean);
  return (
    <div
      className={`mds-card mds-card--interactive flex min-block-20 min-inline-0 flex-[1_1_0] items-center gap-3 px-4 py-0${narrow ? " md:flex-[0_1_var(--layout-sidebar)]" : ""}`}
      data-neighbour={direction}
    >
      {previous ? <Icon name="arrowLeft" /> : null}
      <div
        className={`flex min-inline-0 flex-1 flex-col gap-1${previous ? "" : " text-end"}`}
      >
        <p className="mds-eyebrow truncate" aria-hidden="true">
          {t(previous ? "SessionPage.previousWeek" : "SessionPage.nextWeek", {
            number: session.weekNumber,
          })}
        </p>
        <p className="mds-label truncate font-semibold" dir="auto">
          <a className="mds-card__link" href={href}>
            <span className="mds-visually-hidden">
              {t(previous ? "SessionPage.previousSr" : "SessionPage.nextSr", {
                number: session.weekNumber,
              })}
            </span>
            {session.title}
          </a>
        </p>
        {line.length > 0 ? (
          <p className="mds-caption truncate">{joinRun(line)}</p>
        ) : null}
      </div>
      {previous ? null : <Icon name="arrowRight" />}
    </div>
  );
};

/**
 * The Müfredat list as the combobox draws it (MDRS-289): every celse of the
 * course in programme order, worded here, where the locale and the course's
 * clock are: "Hafta 5", the title, and a run of its day ("3 Eki"), "Bu
 * celse", "Şu an canlı" or "İptal edildi". "Kayıt var" goes only on this
 * celse's row, when its recording can be watched: nothing in the course's
 * data says whether another celse has one.
 */
export const curriculumOptions = ({
  course,
  sessionId,
  now,
  hasRecording,
  t,
  locale,
}: {
  course: CourseDetailResponse;
  sessionId: string;
  now: Date;
  hasRecording: boolean;
  /** the `tedris` namespace */
  t: LooseTranslator;
  locale: string;
}): { options: CurriculumOption[]; weeks: number } => {
  const { rows, weeks } = curriculumOf(course, sessionId, now);
  const day = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: course.timeZone,
  });
  return {
    weeks,
    options: rows.map(({ lesson, weekNumber, state, viewing }) => ({
      id: lesson.id,
      href: lessonHref(course.id, lesson.id),
      weekNumber,
      week: t("SessionPage.week", { number: weekNumber }),
      title: lesson.title,
      state,
      meta: [
        lesson.scheduledAt ? day.format(lesson.scheduledAt) : null,
        viewing ? t("SessionPage.rowViewing") : null,
        state === "live" ? t("SessionPage.liveLabel") : null,
        state === "cancelled" ? t("SessionPage.rowCancelled") : null,
        viewing && hasRecording ? t("SessionPage.rowRecording") : null,
      ].filter((part): part is string => Boolean(part)),
      current: viewing,
    })),
  };
};

/**
 * The bottom row of the celse detail page, always last (MDRS-289): the
 * previous celse, the Müfredat combobox, the next celse, as tall as each
 * other. A missing neighbour leaves no hole: the combobox takes its room.
 * On a phone the combobox has the row to itself and the two neighbours
 * share the row under it; the reading order stays previous, Müfredat, next.
 * The owner: "hep önce-müfredat-sonra şeklinde olabilir".
 */
export const SessionPager = ({
  course,
  session,
  now,
  hasRecording,
  t,
  locale,
}: {
  course: CourseDetailResponse;
  session: SessionResponse;
  now: Date;
  /** this celse's recording can be watched */
  hasRecording: boolean;
  /** the `tedris` namespace */
  t: LooseTranslator;
  locale: string;
}) => {
  const { options, weeks } = curriculumOptions({
    course,
    sessionId: session.id,
    now,
    hasRecording,
    t,
    locale,
  });
  const { previous, next } = session;
  if (options.length === 0 && !previous && !next) return null;
  const week = { week: session.weekNumber, weeks };
  const neighbour = (
    ref: SessionRefResponse,
    direction: "previous" | "next"
  ) => (
    <NeighbourCard
      session={ref}
      direction={direction}
      href={lessonHref(course.id, ref.id)}
      narrow={options.length > 0}
      t={t}
      locale={locale}
      courseTimeZone={course.timeZone}
    />
  );
  return (
    <nav
      className="flex gap-4 max-md:flex-wrap"
      aria-label={t("SessionPage.neighbours")}
      data-testid="session-pager"
    >
      {previous ? neighbour(previous, "previous") : null}
      {options.length > 0 ? (
        <SessionCurriculum
          options={options}
          title={session.title}
          progress={
            weeks > 0
              ? Math.min(100, Math.round((session.weekNumber / weeks) * 100))
              : 0
          }
          courseHref={`/courses/${course.id}?tab=mufredat`}
          locale={locale}
          labels={{
            curriculum: t("SessionPage.curriculum"),
            count: t("SessionPage.sessionsCount", { count: options.length }),
            trigger: t("SessionPage.curriculumLabel", {
              ...week,
              title: session.title,
            }),
            viewing: t("SessionPage.rowViewing"),
            weekOf: t("SessionPage.curriculumWeek", week),
            course: t("SessionPage.curriculumCourse"),
            search: t("SessionPage.curriculumSearch"),
            searchLabel: t("SessionPage.curriculumSearchLabel"),
            noMatch: t("SessionPage.curriculumNoMatch"),
            done: t("SessionPage.rowDone"),
          }}
        />
      ) : null}
      {next ? neighbour(next, "next") : null}
    </nav>
  );
};
