import type {
  MadrasahCourseResponse,
  MadrasahOverviewResponse,
  MadrasahResponse,
} from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { AnonymousInvite } from "~/components/anonymous-invite";
import { joinRun } from "../join-run";
import { enrollmentBadge } from "../madrasah-enrollment";
import { formatNextSession } from "../next-session";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const muderrisLine = (course: MadrasahCourseResponse, t: Translate) =>
  course.muderris.length === 0 ? null : (
    <>
      {t("MadrasahPage.muderris")}{" "}
      {joinRun(
        course.muderris.map((m) => (
          <span key={m.name} style={{ whiteSpace: "nowrap" }}>
            <bdi>{m.name}</bdi>
            {m.isImam ? `, ${t("MadrasahPage.imam")}` : ""}
          </span>
        ))
      )}
    </>
  );

const CourseCard = ({
  course,
  t,
  locale,
  timeZone,
}: {
  course: MadrasahCourseResponse;
  t: Translate;
  locale: string;
  timeZone: string;
}) => {
  const badge = enrollmentBadge(course.enrollmentStatus);
  const next = course.nextSessionAt
    ? formatNextSession(course.nextSessionAt, locale, timeZone)
    : "";
  return (
    <Card
      className="flex flex-col"
      href={`/courses/${course.id}`}
      title={course.title}
      media={
        <CoverPattern
          seed={course.id}
          size="sm"
          label={course.category ?? ""}
        />
      }
      action={
        badge ? (
          <Badge
            variant={badge.variant}
            icon={
              badge.variant === "warning" ? (
                <Icon name="clock" size="sm" />
              ) : undefined
            }
          >
            {t(`MadrasahPage.${badge.labelKey}`)}
          </Badge>
        ) : null
      }
      footer={
        <>
          <span>
            <Link href={`/kosks/${course.koskId}`}>
              <bdi>{course.koskName}</bdi>
            </Link>
            <span className="mds-sep" aria-hidden="true">
              ·
            </span>
          </span>
          <span>
            {next ? (
              <>
                {t("MadrasahPage.nextSession")}{" "}
                <time
                  dateTime={new Date(
                    course.nextSessionAt as Date
                  ).toISOString()}
                >
                  {next}
                </time>
              </>
            ) : (
              t("MadrasahPage.noNextSession")
            )}
          </span>
        </>
      }
    >
      <p className="mds-card__body grow" dir="auto">
        {muderrisLine(course, t)}
      </p>
    </Card>
  );
};

/**
 * A medrese's page (MDRS-157, design tedris/03), open to signed-out visitors
 * (MDRS-122): its summary, its courses with the köşk each is opened in and the
 * caller's own enrollment state, and its başmüderris. The data is
 * `GET /madrasahs/:id/overview`; the meeting links never reach it.
 */
export const MadrasahPage = async ({
  madrasah,
  overview,
  signedIn = true,
}: {
  madrasah: MadrasahResponse;
  overview: MadrasahOverviewResponse;
  /** False for a visitor with no account (design tedris/11): an invitation under the courses. */
  signedIn?: boolean;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const { courses, kosks, headMuderris } = overview;
  const paragraphs = (madrasah.description ?? "")
    .split(/\n{2,}/)
    .filter(Boolean);

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex min-inline-0 flex-col gap-stack">
        <Breadcrumb
          items={[
            { label: t("MadrasahPage.discover"), href: "/discover" },
            { label: madrasah.name },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-nowrap items-start gap-4">
            <Avatar entity size="lg" name={madrasah.name} decorative />
            <div className="flex min-inline-0 flex-col gap-2">
              <p className="mds-eyebrow">{t("MadrasahPage.eyebrow")}</p>
              <h1 className="mds-h1" dir="auto">
                {madrasah.name}
              </h1>
              <p className="mds-body-sm">
                <span>
                  {t("MadrasahPage.coursesCount", { count: courses.length })}
                  {headMuderris?.name ? (
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                  ) : null}
                </span>
                {headMuderris?.name ? (
                  <span>
                    {t("MadrasahPage.headMuderris")}{" "}
                    <bdi>{headMuderris.name}</bdi>
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-section">
          <div className="mds-reading" dir="auto">
            {paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p>{t("MadrasahPage.approvalNotice")}</p>
          </div>

          <section
            className="flex min-inline-0 flex-col gap-3"
            aria-labelledby="madrasah-courses"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
              <h2 className="mds-h2" id="madrasah-courses">
                {t("MadrasahPage.courses")}
              </h2>
              <span className="mds-caption">
                {t(
                  signedIn
                    ? "MadrasahPage.coursesHint"
                    : "MadrasahPage.coursesHintAnonymous"
                )}
              </span>
            </div>
            {courses.length === 0 ? (
              <p className="mds-body">{t("MadrasahPage.noCourses")}</p>
            ) : (
              <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    t={t}
                    locale={locale}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            )}
            {signedIn ? null : (
              <AnonymousInvite
                t={t}
                locale={locale}
                variant="apply"
                callbackPath={`/madrasahs/${madrasah.id}`}
                className="mds-body-sm"
              />
            )}
          </section>
        </div>

        <aside className="sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] flex flex-col gap-4 max-md:static">
          {headMuderris?.name ? (
            <Card title={t("MadrasahPage.headMuderris")} headingLevel={2}>
              <div className="flex items-center gap-3 mbs-6">
                <Avatar name={headMuderris.name} decorative />
                <div>
                  <p className="mds-body">
                    <bdi>{headMuderris.name}</bdi>
                  </p>
                  <p className="mds-caption">
                    {t("MadrasahPage.headMuderrisCourses", {
                      count: headMuderris.courseCount,
                    })}
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
          {kosks.length > 0 ? (
            <Card title={t("MadrasahPage.kosks")} headingLevel={2}>
              <p className="mds-caption mbs-1">{t("MadrasahPage.kosksHint")}</p>
              <ul
                className="m-0 flex list-none flex-col p-0 mbs-2"
                aria-label={t("MadrasahPage.kosksLabel", {
                  name: madrasah.name,
                })}
              >
                {kosks.map((kosk) => (
                  <li
                    key={kosk.id}
                    className="flex items-center gap-3 py-3 [&:not(:last-child)]:border-b-[length:var(--border-width-thin)] [&:not(:last-child)]:border-[color:var(--border-neutral-subtle)]"
                  >
                    <Avatar entity size="sm" name={kosk.name} decorative />
                    <span className="flex min-inline-0 flex-1 flex-col gap-0.5">
                      <Link href={`/kosks/${kosk.id}`}>
                        <bdi>{kosk.name}</bdi>
                      </Link>
                      {courses
                        .filter((c) => c.koskId === kosk.id)
                        .map((c) => (
                          <span key={c.id} className="mds-caption" dir="auto">
                            {c.title}
                          </span>
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </main>
  );
};
