import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { Card } from "@medaris/ui/mds/card";
import { Icon } from "@medaris/ui/mds/icon";
import { resolveMeetingPlatform } from "@medaris/utils";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SessionJoinLive } from "~/features/courses/components/session-join-live";
import { joinRun } from "~/features/courses/join-run";
import { formatSessionMoment } from "~/features/courses/my-courses";
import {
  calendarLabels,
  hostOf,
  sessionJoinLabels,
} from "~/features/courses/session-join-labels";
import { dayInZone } from "~/features/courses/session-model";
import {
  atTime,
  trLocative,
  trNumberWord,
} from "~/features/flashcards/deck-model";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { type DayLabel, dayLabel, formatClock } from "../schedule-model";

// Narrow on purpose: the full translator type hits TS2589 here (MDRS-176).
type Translate = LooseTranslator;

const relativeText = (label: DayLabel, t: Translate): string =>
  label.kind === "inDays"
    ? t("SchedulePage.inDays", { count: label.count })
    : t(`SchedulePage.${label.kind}`);

/** "21:00’de": a time on the hour is said by its hour (yirmi bir’de), any other by its minutes. */
const atClock = (clock: string, locale: string): string => {
  if (!locale.startsWith("tr") || !clock.endsWith(":00")) {
    return atTime(clock, locale);
  }
  return `${clock}’${trLocative(trNumberWord(Number(clock.slice(0, 2))), true)}`;
};

/** "Öbür gün, Cumartesi 21:00": when a session is, from today's point of view. */
const whenText = (
  session: ScheduleSessionResponse,
  now: Date,
  t: Translate,
  locale: string,
  timeZone: string
): string => {
  const day = dayInZone(new Date(session.startsAt), timeZone);
  const label = dayLabel(day, dayInZone(now, timeZone));
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone,
  }).format(new Date(session.startsAt));
  return `${relativeText(label, t).toLocaleLowerCase(locale)}, ${weekday} ${atClock(formatClock(session.startsAt, locale, timeZone), locale)}`;
};

/**
 * The signed-in Ana sayfa's session block (design tedris/44, behind the phone
 * menu): the greeting with the next session in a sentence, the "Sıradaki
 * celse" card, and the sessions after it with the way to Programım.
 * `sessions` is the caller's `GET /me/upcoming-lessons`, null when tedrisat
 * could not answer.
 */
export const HomeSessions = async ({
  name,
  sessions,
  now,
  children,
}: {
  name: string;
  sessions: ScheduleSessionResponse[] | null;
  now: Date;
  /** the sections under the sessions: Kaldığın yerden devam et, the decks, the köşks (MDRS-165) */
  children?: ReactNode;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const [next, ...later] = sessions ?? [];
  const firstName = name.trim().split(/\s+/)[0];

  const platform = next?.meetingUrl
    ? resolveMeetingPlatform(next.meetingUrl)
    : null;

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <header className="flex flex-col gap-2">
        <h1 className="mds-h1" dir="auto">
          {firstName
            ? t("PhoneMenu.greeting", { name: firstName })
            : t("PhoneMenu.greetingAnon")}
        </h1>
        <p className="mds-body">
          {sessions === null
            ? t("PhoneMenu.loadFailed")
            : next?.status === "LIVE"
              ? t("PhoneMenu.liveIntro", { course: next.courseTitle })
              : next
                ? t("PhoneMenu.nextIntro", {
                    when: whenText(next, now, t, locale, timeZone),
                  })
                : t("PhoneMenu.noNext")}
        </p>
      </header>

      {next || later.length > 0 ? (
        <div className="grid items-start gap-x-8 gap-y-10 grid-cols-[minmax(0,5fr)_minmax(0,4fr)] max-md:grid-cols-1">
          {next ? (
            <section
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby="home-next"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="mds-h2" id="home-next">
                  {t("PhoneMenu.nextTitle")}
                </h2>
                <Link
                  className="mds-btn mds-btn--link"
                  href={`/courses/${next.courseId}/lessons/${next.id}`}
                >
                  {t("PhoneMenu.sessionPage")}
                </Link>
              </div>
              <p className="mds-body-sm" dir="auto">
                {joinRun([
                  <Link
                    key="c"
                    href={`/courses/${next.courseId}`}
                    className="underline underline-offset-4"
                  >
                    <bdi>{next.courseTitle}</bdi>
                  </Link>,
                  t("SchedulePage.week", { week: next.weekNumber }),
                  <bdi key="k">{next.koskName}</bdi>,
                ])}
              </p>
              <SessionJoinLive
                renderedAt={now.toISOString()}
                startsAt={new Date(next.startsAt).toISOString()}
                durationMinutes={next.durationMinutes ?? undefined}
                cancelled={false}
                title={next.title}
                headingLevel={3}
                courseId={next.courseId}
                courseTitle={next.courseTitle}
                lessonId={next.id}
                meetingUrl={next.meetingUrl ?? undefined}
                platform={platform?.id}
                platformHost={
                  next.meetingUrl ? hostOf(next.meetingUrl) : undefined
                }
                locale={locale}
                timeZone={timeZone}
                courseTimeZone={timeZone}
                calendar={calendarLabels(t)}
                labels={{
                  ...sessionJoinLabels(t),
                  noLinkText: t("SchedulePage.noLink"),
                }}
              />
            </section>
          ) : null}

          {later.length > 0 ? (
            <section
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby="home-later"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 className="mds-h2" id="home-later">
                  {t("PhoneMenu.upcomingTitle")}
                </h2>
                <Link className="mds-btn mds-btn--link" href="/schedule">
                  {t("PhoneMenu.schedule")}
                </Link>
              </div>
              <Card>
                <ul className="m-0 flex list-none flex-col p-0">
                  {later.map((session) => (
                    <li
                      key={session.id}
                      className="flex items-start justify-between gap-4 py-3 border-be border-neutral-subtle first:pbs-0 last:pbe-0 last:border-be-0"
                    >
                      <div className="flex min-inline-0 items-start gap-3">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-sunken"
                          aria-hidden="true"
                        >
                          <Icon name="video" />
                        </span>
                        <div className="flex min-inline-0 flex-col gap-1">
                          <Link
                            href={`/courses/${session.courseId}/lessons/${session.id}`}
                            className="mds-h4"
                            dir="auto"
                          >
                            {session.title}
                          </Link>
                          <span className="mds-caption" dir="auto">
                            {joinRun([
                              t("PhoneMenu.liveBadge"),
                              <bdi key="c">{session.courseTitle}</bdi>,
                              t("SchedulePage.week", {
                                week: session.weekNumber,
                              }),
                              formatSessionMoment(
                                session.startsAt,
                                locale,
                                timeZone
                              ),
                            ])}
                          </span>
                        </div>
                      </div>
                      {session.durationMinutes ? (
                        <span className="mds-caption shrink-0">
                          {t("SchedulePage.minutes", {
                            count: session.durationMinutes,
                          })}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ) : null}
        </div>
      ) : null}

      {children}
    </main>
  );
};
