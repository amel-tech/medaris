import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { resolveMeetingPlatform } from "@medaris/utils";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { CalendarMenu } from "~/features/courses/components/calendar-menu";
import { joinRun } from "~/features/courses/join-run";
import { dayInZone } from "~/features/courses/session-model";
import {
  type DayLabel,
  dayLabel,
  formatClock,
  formatDayHeading,
} from "../schedule-model";

type Translate = Awaited<ReturnType<typeof getTranslations>>;

const relativeText = (label: DayLabel, t: Translate): string =>
  label.kind === "inDays"
    ? t("SchedulePage.inDays", { count: label.count })
    : t(`SchedulePage.${label.kind}`);

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
  return `${relativeText(label, t)}, ${weekday} ${formatClock(session.startsAt, locale, timeZone)}`;
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
}: {
  name: string;
  sessions: ScheduleSessionResponse[] | null;
  now: Date;
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
            : next
              ? t("PhoneMenu.nextIntro", {
                  when: whenText(next, now, t, locale, timeZone),
                })
              : t("PhoneMenu.noNext")}
        </p>
      </header>

      {next ? (
        <Card
          className="flex flex-col"
          title={t("PhoneMenu.nextTitle")}
          headingLevel={2}
          action={
            <span className="mds-badge mds-badge--secondary">
              {next.status === "LIVE"
                ? t("SchedulePage.statusLive")
                : t("PhoneMenu.liveBadge")}
            </span>
          }
        >
          <div className="flex flex-col gap-2 mbs-3">
            <p className="mds-caption">
              {relativeText(
                dayLabel(
                  dayInZone(new Date(next.startsAt), timeZone),
                  dayInZone(now, timeZone)
                ),
                t
              )}
            </p>
            <p className="mds-caption" dir="auto">
              {joinRun([
                <bdi key="c">{next.courseTitle}</bdi>,
                t("SchedulePage.week", { week: next.weekNumber }),
                <bdi key="k">{next.koskName}</bdi>,
              ])}
            </p>
            <p className="mds-h3" dir="auto">
              {next.title}
            </p>
            <p className="mds-body-sm">
              {joinRun([
                formatDayHeading(
                  dayInZone(new Date(next.startsAt), timeZone),
                  locale,
                  timeZone
                ),
                formatClock(next.startsAt, locale, timeZone),
                ...(next.durationMinutes
                  ? [t("SchedulePage.minutes", { count: next.durationMinutes })]
                  : []),
              ])}
            </p>
            {platform && next.meetingUrl ? (
              <p>
                <PlatformChip platform={platform.id} />
              </p>
            ) : (
              <p className="mds-caption">{t("SchedulePage.noLink")}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mbs-2">
              <Button
                variant="outline"
                size="small"
                href={`/courses/${next.courseId}/lessons/${next.id}`}
              >
                {t("PhoneMenu.sessionPage")}
              </Button>
              <CalendarMenu
                text
                courseId={next.courseId}
                courseTitle={next.courseTitle}
                lesson={{
                  id: next.id,
                  title: next.title,
                  startsAt: new Date(next.startsAt).toISOString(),
                  durationMinutes: next.durationMinutes ?? undefined,
                }}
                locale={locale}
                labels={{
                  button: t("AddToCalendar.button"),
                  google: t("AddToCalendar.google"),
                  apple: t("AddToCalendar.apple"),
                  downloadFailed: t("AddToCalendar.downloadFailed"),
                  subscribe: t("AddToCalendar.subscribe"),
                  note: t("AddToCalendar.note"),
                  linkIsOnPage: t("AddToCalendar.linkIsOnPage"),
                }}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {later.length > 0 ? (
        <section
          className="flex min-inline-0 flex-col gap-3"
          aria-labelledby="home-later"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="mds-h3" id="home-later">
              {t("PhoneMenu.upcomingTitle")}
            </h2>
            <Link className="mds-btn mds-btn--link" href="/schedule">
              {t("PhoneMenu.schedule")}
              <Icon name="arrowRight" size="sm" />
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {later.map((session) => (
              <li
                key={session.id}
                className="flex flex-col gap-1 py-3 border-be border-neutral-subtle last:border-be-0"
              >
                <span className="mds-caption">
                  {whenText(session, now, t, locale, timeZone)}
                </span>
                <Link
                  href={`/courses/${session.courseId}/lessons/${session.id}`}
                  className="mds-h4 underline underline-offset-4"
                  dir="auto"
                >
                  {session.title}
                </Link>
                <span className="mds-caption" dir="auto">
                  <bdi>{session.courseTitle}</bdi>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
};
