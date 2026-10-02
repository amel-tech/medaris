import type {
  EnrolledCourseResponse,
  FlashcardDeckSummaryResponse,
  FollowedKoskCourseResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Progress } from "@medaris/ui/mds/progress";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { joinRun } from "~/features/courses/join-run";
import { formatSessionMoment } from "~/features/courses/my-courses";
import { coursesToContinue, deckLine } from "../model";
import { getHomeCourses, getHomeDecks, getHomeFollowedCourses } from "../reads";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

/** The head of a section: its name, and the way to the page it summarises. */
const SectionHead = ({
  id,
  title,
  href,
  link,
}: {
  id: string;
  title: string;
  href: string;
  link: string;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
    <h2 className="mds-h2" id={id}>
      {title}
    </h2>
    <Link className="mds-btn mds-btn--link" href={href}>
      {link}
    </Link>
  </div>
);

/** One section's own failure: the others stay (design tedris/01, state "Hata"). */
const SectionFailed = ({ title, retry }: { title: string; retry: string }) => (
  <Alert tone="error" title={title}>
    <p className="mbs-3">
      <Button variant="outline" size="small" href="">
        {retry}
      </Button>
    </p>
  </Alert>
);

/** The shape a section holds while its read is on the way. */
export const SectionSkeleton = ({
  columns = 1,
  label,
}: {
  columns?: 1 | 3;
  label: string;
}) => (
  <section
    className="flex min-inline-0 flex-col gap-3"
    aria-busy="true"
    aria-label={label}
  >
    <Skeleton width="16rem" height="2rem" />
    <div
      className={
        columns === 3
          ? "grid gap-grid grid-cols-3 max-md:grid-cols-1"
          : "grid gap-grid grid-cols-1"
      }
    >
      {Array.from({ length: columns }, (_, i) => (
        <Skeleton key={i} height="10rem" />
      ))}
    </div>
  </section>
);

/** "Müderris A, imam · B": who teaches a course, as Derslerim writes it. */
const teachers = (
  muderris: { id: string; name: string; isImam: boolean }[],
  t: Translate
) =>
  muderris.length > 0 ? (
    <span>
      {t("KoskPage.muderris")}{" "}
      {joinRun(
        muderris.map((m) => (
          <span key={m.id} style={{ whiteSpace: "nowrap" }}>
            <bdi>{m.name}</bdi>
            {m.isImam ? `, ${t("KoskPage.imam")}` : ""}
          </span>
        ))
      )}
    </span>
  ) : null;

const ContinueCard = ({
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
    footer={
      <span>
        {joinRun(
          [
            course.madrasahName ? (
              <bdi key="m">{course.madrasahName}</bdi>
            ) : null,
            <bdi key="k">{course.koskName}</bdi>,
            course.nextSession ? (
              <span key="n">
                {t("MyCoursesPage.nextSession")}{" "}
                <time dateTime={new Date(course.nextSession.at).toISOString()}>
                  {formatSessionMoment(course.nextSession.at, locale, timeZone)}
                </time>
              </span>
            ) : (
              <span key="n">{t("MyCoursesPage.noNextSession")}</span>
            ),
          ].filter(Boolean)
        )}
      </span>
    }
  >
    <p className="mds-card__body grow" dir="auto">
      {teachers(course.muderris, t)}
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

/** "Kaldığın yerden devam et": up to three courses in progress. */
export const ContinueSection = async () => {
  const [t, learn, locale, timeZone, courses] = await Promise.all([
    getTranslations("tedris"),
    getTranslations("tedrisLearn"),
    getLocale(),
    getTimeZone(),
    getHomeCourses(),
  ]);
  const shown = courses ? coursesToContinue(courses) : [];
  return (
    <section
      className="flex min-inline-0 flex-col gap-3"
      aria-labelledby="home-continue"
    >
      <SectionHead
        id="home-continue"
        title={learn("Home.continueTitle")}
        href="/my-courses"
        link={t("PhoneMenu.courses")}
      />
      {courses === null ? (
        <SectionFailed
          title={learn("Home.sectionFailed")}
          retry={learn("Home.retry")}
        />
      ) : shown.length === 0 ? (
        <EmptyState
          action={
            <Button variant="outline" href="/discover">
              {t("MyCoursesPage.goDiscover")}
            </Button>
          }
        >
          {learn("Home.emptyCourses")}
        </EmptyState>
      ) : (
        <div className="grid gap-grid grid-cols-3 max-md:grid-cols-1 [&>*]:min-inline-0">
          {shown.map((course) => (
            <ContinueCard
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
  );
};

const deckKindLabel = (deck: FlashcardDeckSummaryResponse, t: Translate) => {
  if (deck.isMine) return t("Decks.yours");
  switch (deck.collectionKind) {
    case "COURSE":
      return t("Decks.kindCOURSE");
    case "KOSK":
      return t("Decks.kindKOSK");
    case "MADRASAH":
      return t("Decks.kindMADRASAH");
    default:
      return t("Decks.kindPUBLIC");
  }
};

/** "Bugün çalışılacak desteler": the decks with cards to repeat or new cards. */
export const DecksSection = async () => {
  const [t, learn, decks] = await Promise.all([
    getTranslations("tedris"),
    getTranslations("tedrisLearn"),
    getHomeDecks(),
  ]);
  return (
    <section
      className="flex min-inline-0 flex-col gap-3"
      aria-labelledby="home-decks"
    >
      <SectionHead
        id="home-decks"
        title={learn("Home.decksTitle")}
        href="/decks"
        link={t("PhoneMenu.decks")}
      />
      {decks === null ? (
        <SectionFailed
          title={learn("Home.sectionFailed")}
          retry={learn("Home.retry")}
        />
      ) : decks.length === 0 ? (
        <EmptyState>{learn("Home.emptyDecks")}</EmptyState>
      ) : (
        <Card>
          <ul className="m-0 flex list-none flex-col p-0">
            {decks.map((deck) => {
              const line = deckLine(deck);
              return (
                <li
                  key={deck.id}
                  className="flex items-center justify-between gap-4 py-3 border-be border-neutral-subtle first:pbs-0 last:pbe-0 last:border-be-0"
                >
                  <div className="flex min-inline-0 items-center gap-3">
                    <Avatar entity decorative name={deck.title} />
                    <div className="flex min-inline-0 flex-col">
                      <Link
                        href={`/decks/${deck.id}`}
                        className="mds-body font-medium"
                        dir="auto"
                      >
                        {deck.title}
                      </Link>
                      <span className="mds-caption">
                        {joinRun([
                          deckKindLabel(deck, t),
                          line.kind === "due"
                            ? t("Decks.dueCount", { count: line.count })
                            : t("Decks.added", { count: line.count }),
                        ])}
                      </span>
                    </div>
                  </div>
                  <Button
                    href={`/decks/study/${deck.id}`}
                    variant="outline"
                    size="small"
                    aria-label={learn("Home.studyDeck", { title: deck.title })}
                  >
                    {t("Decks.study")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
};

/** One line of "Takip ettiğin köşklerden": a tile in the course's hue, its name, where and who. */
const FollowedLine = ({
  course,
  t,
}: {
  course: FollowedKoskCourseResponse;
  t: Translate;
}) => (
  <li className="flex items-center gap-3 py-3 border-be border-neutral-subtle first:pbs-0 last:pbe-0 last:border-be-0">
    <CoverPattern seed={course.id} size="xs" aria-hidden="true" />
    <div className="flex min-inline-0 flex-col">
      <Link
        href={`/courses/${course.id}`}
        className="mds-body underline underline-offset-4"
        dir="auto"
      >
        {course.title}
      </Link>
      <span className="mds-caption" dir="auto">
        {joinRun(
          [
            <bdi key="k">{course.koskName}</bdi>,
            course.muderrisName ? (
              <span key="m">
                {t("KoskPage.muderris")} <bdi>{course.muderrisName}</bdi>
                {course.muderrisIsImam ? `, ${t("KoskPage.imam")}` : ""}
              </span>
            ) : null,
          ].filter(Boolean)
        )}
      </span>
    </div>
  </li>
);

/** "Takip ettiğin köşklerden": courses of the köşks the caller follows. */
export const FollowedSection = async () => {
  const [t, learn, courses] = await Promise.all([
    getTranslations("tedris"),
    getTranslations("tedrisLearn"),
    getHomeFollowedCourses(),
  ]);
  return (
    <section
      className="flex min-inline-0 flex-col gap-3"
      aria-labelledby="home-followed"
    >
      <SectionHead
        id="home-followed"
        title={learn("Home.followedTitle")}
        href="/discover"
        link={t("PhoneMenu.discover")}
      />
      {courses === null ? (
        <SectionFailed
          title={learn("Home.sectionFailed")}
          retry={learn("Home.retry")}
        />
      ) : courses.length === 0 ? (
        <EmptyState>{learn("Home.emptyFollowed")}</EmptyState>
      ) : (
        <Card>
          <ul className="m-0 flex list-none flex-col p-0">
            {courses.map((course) => (
              <FollowedLine key={course.id} course={course} t={t} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
};
