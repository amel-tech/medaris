import type { EnrolledCourseResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Progress } from "@medaris/ui/mds/progress";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { joinRun } from "../join-run";
import {
  formatLongDate,
  formatSessionMoment,
  splitMyCourses,
} from "../my-courses";
import { ApplicationRow } from "./application-row";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const SectionHead = ({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
    <h2 className="mds-h2" id={id}>
      {title}
    </h2>
    <span className="mds-caption">{note}</span>
  </div>
);

/** "Nûruosmaniye Köşkü · Müderris A, imam · B": where the course is and who teaches it. */
const placeAndTeachers = (course: EnrolledCourseResponse, t: Translate) => {
  const parts = [
    course.madrasahName ? (
      <bdi key="madrasah">{course.madrasahName}</bdi>
    ) : null,
    <bdi key="kosk">{course.koskName}</bdi>,
    course.muderris.length > 0 ? (
      <span key="muderris">
        {t("KoskPage.muderris")}{" "}
        {joinRun(
          course.muderris.map((m) => (
            <span key={m.id} style={{ whiteSpace: "nowrap" }}>
              <bdi>{m.name}</bdi>
              {m.isImam ? `, ${t("KoskPage.imam")}` : ""}
            </span>
          ))
        )}
      </span>
    ) : null,
  ].filter(Boolean);
  return joinRun(parts);
};

const OngoingCard = ({
  course,
  t,
  locale,
  timeZone,
}: {
  course: EnrolledCourseResponse;
  t: Translate;
  locale: string;
  timeZone: string;
}) => (
  <Card
    className="flex flex-col"
    href={`/courses/${course.id}`}
    title={course.title}
    media={
      <CoverPattern seed={course.id} size="sm" label={course.category ?? ""} />
    }
    action={<Badge variant="brand">{t("MyCoursesPage.statusEnrolled")}</Badge>}
    footer={
      course.nextSession ? (
        <span>
          {t("MyCoursesPage.nextSession")}
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          <time dateTime={new Date(course.nextSession.at).toISOString()}>
            {formatSessionMoment(course.nextSession.at, locale, timeZone)}
          </time>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          {t("MyCoursesPage.week", { week: course.nextSession.weekNumber })}
        </span>
      ) : (
        <span>{t("MyCoursesPage.noNextSession")}</span>
      )
    }
  >
    <p className="mds-card__body grow" dir="auto">
      {placeAndTeachers(course, t)}
    </p>
    <div className="mbs-4">
      <Progress
        label={t("MyCoursesPage.progress")}
        value={course.enrollment.progress}
        showValue
        completeLabel={t("MyCoursesPage.statusCompleted")}
        locale={locale}
      />
    </div>
  </Card>
);

const CourseLine = ({
  course,
  t,
  note,
}: {
  course: EnrolledCourseResponse;
  t: Translate;
  note: string;
}) => (
  <>
    <Link href={`/courses/${course.id}`} className="mds-h4" dir="auto">
      <bdi>{course.title}</bdi>
    </Link>
    <p className="mds-caption" dir="auto">
      {placeAndTeachers(course, t)}
    </p>
    <p className="mds-caption">{note}</p>
  </>
);

/**
 * Derslerim (MDRS-159, design tedris/20): the courses the talebe is enrolled
 * in with their progress and next session, the requests still waiting for
 * approval (which they may withdraw), and the courses the team marked
 * completed. A failed read is an Alert with a way to try again.
 */
export const MyCoursesPage = async ({
  courses,
  failed = false,
}: {
  courses: EnrolledCourseResponse[] | null;
  failed?: boolean;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const sections = splitMyCourses(courses ?? []);
  const none =
    sections.ongoing.length +
      sections.applications.length +
      sections.completed.length ===
    0;

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-inline-0 flex-col gap-3">
          <h1 className="mds-h1">{t("MyCoursesPage.title")}</h1>
          <p className="mds-body">{t("MyCoursesPage.subtitle")}</p>
        </div>
        <Button
          variant="secondary"
          href="/learning/calendar"
          iconLeft={<Icon name="calendar" size="sm" />}
        >
          {t("CalendarSubscription.link")}
        </Button>
      </div>

      {failed || courses === null ? (
        <Alert tone="error" title={t("MyCoursesPage.loadErrorTitle")}>
          <p>{t("MyCoursesPage.loadError")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href="">
              {t("MyCoursesPage.retry")}
            </Button>
          </p>
        </Alert>
      ) : none ? (
        <EmptyState
          action={
            <Button variant="outline" href="/discover">
              {t("MyCoursesPage.goDiscover")}
            </Button>
          }
        >
          {t("MyCoursesPage.noCourses")}
        </EmptyState>
      ) : (
        <>
          <section
            className="flex min-inline-0 flex-col gap-3"
            aria-labelledby="my-ongoing"
          >
            <SectionHead
              id="my-ongoing"
              title={t("MyCoursesPage.ongoingTitle")}
              note={t("MyCoursesPage.ongoingCount", {
                count: sections.ongoing.length,
              })}
            />
            {sections.ongoing.length === 0 ? (
              <EmptyState>{t("MyCoursesPage.ongoingEmpty")}</EmptyState>
            ) : (
              <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
                {sections.ongoing.map((course) => (
                  <OngoingCard
                    key={course.id}
                    course={course}
                    t={t}
                    locale={locale}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            className="flex min-inline-0 flex-col gap-3"
            aria-labelledby="my-applications"
          >
            <SectionHead
              id="my-applications"
              title={t("MyCoursesPage.applicationsTitle")}
              note={t("MyCoursesPage.applicationsCount", {
                count: sections.applications.length,
              })}
            />
            {sections.applications.length === 0 ? (
              <EmptyState>{t("MyCoursesPage.applicationsEmpty")}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {sections.applications.map((course) => (
                  <ApplicationRow
                    key={course.id}
                    courseId={course.id}
                    courseTitle={course.title}
                    cover={
                      <CoverPattern
                        seed={course.id}
                        size="xs"
                        aria-hidden="true"
                      />
                    }
                    status={
                      <Badge
                        variant="warning"
                        icon={<Icon name="clock" size="sm" />}
                      >
                        {t("MyCoursesPage.statusPending")}
                      </Badge>
                    }
                    labels={{
                      withdraw: t("MyCoursesPage.withdraw"),
                      failed: t("MyCoursesPage.withdrawFailed"),
                    }}
                  >
                    <CourseLine
                      course={course}
                      t={t}
                      note={t("MyCoursesPage.appliedOn", {
                        date: formatLongDate(
                          course.enrollment.createdAt,
                          locale,
                          timeZone
                        ),
                      })}
                    />
                  </ApplicationRow>
                ))}
              </ul>
            )}
          </section>

          <section
            className="flex min-inline-0 flex-col gap-3"
            aria-labelledby="my-completed"
          >
            <SectionHead
              id="my-completed"
              title={t("MyCoursesPage.completedTitle")}
              note={t("MyCoursesPage.completedCount", {
                count: sections.completed.length,
              })}
            />
            {sections.completed.length === 0 ? (
              <EmptyState>{t("MyCoursesPage.completedEmpty")}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {sections.completed.map((course) => (
                  <li key={course.id}>
                    <Card className="flex flex-row flex-wrap items-center gap-4">
                      <CoverPattern
                        seed={course.id}
                        size="xs"
                        aria-hidden="true"
                      />
                      <div className="flex min-inline-0 grow basis-72 flex-col gap-1">
                        <CourseLine
                          course={course}
                          t={t}
                          note={t("MyCoursesPage.completedOn", {
                            date: formatLongDate(
                              course.enrollment.completedAt ??
                                course.enrollment.updatedAt,
                              locale,
                              timeZone
                            ),
                          })}
                        />
                      </div>
                      <div className="flex flex-none items-center gap-3 max-md:flex-wrap">
                        <Badge
                          variant="success"
                          icon={<Icon name="check" size="sm" />}
                        >
                          {t("MyCoursesPage.statusCompleted")}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="small"
                          href={`/courses/${course.id}`}
                        >
                          {t("MyCoursesPage.recordings")}
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
};
