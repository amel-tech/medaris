import type {
  CourseSummaryResponse,
  KoskDecksResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { AnonymousInvite } from "~/components/anonymous-invite";
import { courseCover } from "~/features/courses/course-cover";
import { FollowButton } from "~/features/discover/components/follow-button";
import { joinRun } from "../join-run";
import { enrollmentBadge } from "../madrasah-enrollment";
import { formatNextSession } from "../next-session";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const muderrisLine = (course: CourseSummaryResponse, t: Translate) =>
  course.muderris.length === 0 ? null : (
    <>
      {t("KoskPage.muderris")}{" "}
      {joinRun(
        course.muderris.map((m) => (
          <span key={m.id} style={{ whiteSpace: "nowrap" }}>
            <bdi>{m.name}</bdi>
            {m.isImam ? `, ${t("KoskPage.imam")}` : ""}
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
  course: CourseSummaryResponse;
  t: Translate;
  locale: string;
  timeZone: string;
}) => {
  const badge = enrollmentBadge(course.enrollment?.status);
  const next = course.nextSessionAt
    ? formatNextSession(course.nextSessionAt, locale, timeZone)
    : "";
  return (
    <Card
      className="flex flex-col"
      href={`/courses/${course.id}`}
      title={course.title}
      media={<CoverPattern {...courseCover(course)} size="sm" />}
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
            {t(`KoskPage.${badge.labelKey}`)}
          </Badge>
        ) : null
      }
      footer={
        next && course.nextSessionAt ? (
          <span>
            {t("KoskPage.nextSession")}{" "}
            <time dateTime={new Date(course.nextSessionAt).toISOString()}>
              {next}
            </time>
          </span>
        ) : (
          <span>{t("KoskPage.noNextSession")}</span>
        )
      }
    >
      <div className="mds-card__body flex grow flex-col gap-2">
        {course.madrasah ? (
          <p className="flex items-start gap-2">
            <Icon name="medrese" size="sm" className="mbs-1 flex-none" />
            <span>
              <Link href={`/madrasahs/${course.madrasah.id}`}>
                <bdi>{course.madrasah.name}</bdi>
              </Link>{" "}
              {t("KoskPage.madrasahCourse")}
            </span>
          </p>
        ) : null}
        <p dir="auto">{muderrisLine(course, t)}</p>
      </div>
    </Card>
  );
};

/**
 * A köşk's page (MDRS-159, design tedris/04): who it is, its courses with the
 * medrese that opened each and the next session, and, for the talebe it
 * belongs to, its decks. Open to signed-out visitors (MDRS-122), who get no
 * follow button and no decks.
 */
export const KoskPage = async ({
  kosk,
  courses,
  decks,
  signedIn,
}: {
  kosk: KoskResponse;
  courses: CourseSummaryResponse[];
  decks: KoskDecksResponse | null;
  signedIn: boolean;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex min-inline-0 flex-col gap-stack">
        <Breadcrumb
          items={[
            { label: t("KoskPage.discover"), href: "/discover" },
            { label: kosk.name },
          ]}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-nowrap items-start gap-4">
            <Avatar entity size="lg" name={kosk.name} decorative />
            <div className="flex min-inline-0 flex-col gap-2">
              <p className="mds-eyebrow">{t("KoskPage.eyebrow")}</p>
              <h1 className="mds-h1" dir="auto">
                {kosk.name}
              </h1>
              <p className="mds-body-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  {t("KoskPage.coursesCount", { count: kosk.courseCount })}
                </span>
                {kosk.isPrivate ? (
                  <Badge variant="outline">{t("KoskPage.private")}</Badge>
                ) : null}
              </p>
              {kosk.managerName ? (
                <p className="mds-body-sm">
                  {t("KoskPage.manager", { name: kosk.managerName })}
                </p>
              ) : null}
            </div>
          </div>
          {signedIn ? (
            <FollowButton
              size="regular"
              koskId={kosk.id}
              koskName={kosk.name}
              following={kosk.isFollowing}
              labels={{
                follow: t("KoskPage.follow"),
                following: t("KoskPage.following"),
                failed: t("KoskPage.followFailed"),
              }}
            />
          ) : null}
        </div>
        {kosk.description ? (
          <div className="mds-reading" dir="auto">
            <p>{kosk.description}</p>
          </div>
        ) : null}
      </div>

      <section
        className="flex min-inline-0 flex-col gap-3"
        aria-labelledby="kosk-courses"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="mds-h2" id="kosk-courses">
            {t("KoskPage.coursesTitle")}
          </h2>
          <span className="mds-caption">{t("KoskPage.coursesHint")}</span>
        </div>
        {courses.length === 0 ? (
          <EmptyState>{t("KoskPage.noCoursesYet")}</EmptyState>
        ) : (
          <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
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
            callbackPath={`/kosks/${kosk.id}`}
            className="mds-body-sm"
          />
        )}
      </section>

      {decks?.accessible ? (
        <section
          className="flex min-inline-0 flex-col gap-3"
          aria-labelledby="kosk-decks"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h2" id="kosk-decks">
              {t("KoskPage.decksTitle")}
            </h2>
            <span className="mds-caption">{t("KoskPage.decksHint")}</span>
          </div>
          {decks.decks.length === 0 ? (
            <EmptyState>{t("KoskPage.decksEmpty")}</EmptyState>
          ) : (
            <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
              {decks.decks.map((deck) => (
                <Card
                  key={deck.id}
                  className="flex flex-col"
                  href={`/decks/${deck.id}`}
                  title={
                    <span className="flex items-center gap-3">
                      <Avatar entity decorative name={deck.title} />
                      <span>{deck.title}</span>
                    </span>
                  }
                  footer={
                    deck.inCollection ? (
                      <span>{t("KoskPage.inCollection")}</span>
                    ) : null
                  }
                >
                  <p className="mds-card__body grow">
                    {t("KoskPage.deckMeta")}
                    <span className="mds-sep" aria-hidden="true">
                      ·
                    </span>
                    {t("KoskPage.cardsCount", { count: deck.cardCount })}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
};

/**
 * The köşk could not be read (design tedris/04): an Alert in the page with a
 * way to try again, not the generic error page and not a "no such köşk".
 */
export const KoskLoadError = async ({ koskId }: { koskId: string }) => {
  const t = await getTranslations("tedris");
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <Breadcrumb
        items={[{ label: t("KoskPage.discover"), href: "/discover" }]}
      />
      <Alert tone="error" title={t("KoskPage.loadErrorTitle")}>
        <p>{t("KoskPage.loadError")}</p>
        <p className="mbs-3">
          <Button variant="outline" size="small" href={`/kosks/${koskId}`}>
            {t("KoskPage.retry")}
          </Button>
        </p>
      </Alert>
    </main>
  );
};
