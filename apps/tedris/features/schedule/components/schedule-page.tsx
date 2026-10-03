import type { ScheduleSessionResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { DEFAULT_TIME_ZONE, resolveMeetingPlatform } from "@medaris/utils";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarMenu } from "~/features/courses/components/calendar-menu";
import { sessionStateOf, zoneLabel } from "~/features/courses/session-model";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  type DayLabel,
  dayLabel,
  formatClock,
  formatDayHeading,
  groupByDay,
  type ScheduleWindow,
} from "../schedule-model";

// Narrow on purpose: the full translator type hits TS2589 here (MDRS-176).
type Translate = LooseTranslator;

const hostOf = (url: string): string | undefined => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return undefined;
  }
};

const relativeText = (label: DayLabel, t: Translate): string =>
  label.kind === "inDays"
    ? t("SchedulePage.inDays", { count: label.count })
    : t(`SchedulePage.${label.kind}`);

const ScheduleRow = ({
  session,
  now,
  t,
  locale,
  timeZone,
}: {
  session: ScheduleSessionResponse;
  now: Date;
  t: Translate;
  locale: string;
  timeZone: string;
}) => {
  const startsAt = new Date(session.startsAt);
  const state = sessionStateOf(
    {
      cancelledAt: session.status === "CANCELLED" ? startsAt : null,
      startsAt,
      durationMinutes: session.durationMinutes,
    },
    now
  );
  const cancelled = state === "cancelled";
  const platform = session.meetingUrl
    ? resolveMeetingPlatform(session.meetingUrl)
    : null;
  const href = `/courses/${session.courseId}/lessons/${session.id}`;

  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-4 border-be border-neutral-subtle last:border-be-0 max-md:grid-cols-[3.5rem_minmax(0,1fr)]">
      <div className="flex flex-col">
        <time className="mds-h4 mds-num" dateTime={startsAt.toISOString()}>
          {formatClock(startsAt, locale, timeZone)}
        </time>
        {session.durationMinutes ? (
          <span className="mds-caption">
            {t("SchedulePage.minutes", { count: session.durationMinutes })}
          </span>
        ) : null}
      </div>

      <div className="flex min-inline-0 flex-col gap-1">
        <p className="mds-caption" dir="auto">
          <bdi>{session.courseTitle}</bdi>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          {t("SchedulePage.week", { week: session.weekNumber })}
        </p>
        <Link
          href={href}
          className="mds-h4 underline underline-offset-4"
          dir="auto"
        >
          {session.title}
        </Link>
        {cancelled ? (
          <p className="mds-caption">{t("SchedulePage.cancelledNote")}</p>
        ) : platform && session.meetingUrl ? (
          <p>
            <PlatformChip
              platform={platform.id}
              host={hostOf(session.meetingUrl)}
            />
          </p>
        ) : (
          <p className="mds-caption">{t("SchedulePage.noLink")}</p>
        )}
      </div>

      <div className="flex items-center gap-2 max-md:col-start-2 max-md:row-start-3">
        {cancelled ? (
          <span className="mds-badge mds-badge--outline">
            {t("SchedulePage.statusCancelled")}
          </span>
        ) : (
          <>
            {state === "live" ? (
              // Design tedris/21 "şu an canlı": the live badge and the way in.
              <>
                <span className="mds-badge mds-badge--live">
                  <span className="mds-badge__dot" aria-hidden="true" />
                  {t("SessionPage.liveLabel")}
                </span>
                {session.meetingUrl ? (
                  <a
                    className="mds-btn mds-btn--small mds-btn--primary mds-join__link"
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("SessionPage.joinAction")}
                    <span className="mds-visually-hidden">
                      {t("SessionPage.newTab")}
                    </span>
                  </a>
                ) : null}
              </>
            ) : (
              <span className="mds-badge mds-badge--secondary">
                {t(
                  state === "ended"
                    ? "SchedulePage.statusEnded"
                    : "SchedulePage.statusScheduled"
                )}
              </span>
            )}
            {state === "upcoming" ? (
              <CalendarMenu
                courseId={session.courseId}
                courseTitle={session.courseTitle}
                lesson={{
                  id: session.id,
                  title: session.title,
                  startsAt: startsAt.toISOString(),
                  durationMinutes: session.durationMinutes ?? undefined,
                }}
                locale={locale}
                labels={{
                  button: t("AddToCalendar.rowLabel", { title: session.title }),
                  google: t("AddToCalendar.google"),
                  apple: t("AddToCalendar.apple"),
                  downloadFailed: t("AddToCalendar.downloadFailed"),
                  subscribe: t("AddToCalendar.subscribe"),
                  note: t("AddToCalendar.note"),
                  linkIsOnPage: t("AddToCalendar.linkIsOnPage"),
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </li>
  );
};

/**
 * Programım (design tedris/21, MDRS-163): the live sessions of the courses the
 * talebe is enrolled in over seven days, grouped by day, a cancelled one kept
 * and marked. `sessions` is null when tedrisat could not answer, which is an
 * Alert with a way to try again, never an empty week.
 */
export const SchedulePage = async ({
  sessions,
  window,
  now,
}: {
  sessions: ScheduleSessionResponse[] | null;
  window: ScheduleWindow;
  now: Date;
}) => {
  const t = await getTranslations("tedris");
  const locale = await getLocale();
  // Programım is written in Istanbul time, as the page says, whatever zone the
  // viewer reads in (design tedris/21, criterion 5).
  const timeZone = DEFAULT_TIME_ZONE;
  const groups = groupByDay(sessions ?? [], timeZone);

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex min-inline-0 flex-col gap-3">
          <h1 className="mds-h1">{t("SchedulePage.title")}</h1>
          <p className="mds-body">{t("SchedulePage.subtitle")}</p>
          <p className="mds-caption">
            {t("SchedulePage.zone", { zone: zoneLabel(timeZone, locale) })}{" "}
            <Link className="mds-btn mds-btn--link" href="/account">
              {t("SchedulePage.changeZone")}
            </Link>
          </p>
        </div>
        <Button
          variant="secondary"
          href="/account/calendar"
          iconLeft={<Icon name="calendar" size="sm" />}
        >
          {t("CalendarSubscription.link")}
        </Button>
      </div>

      {sessions === null ? (
        <Alert tone="error" title={t("SchedulePage.loadErrorTitle")}>
          <p>{t("SchedulePage.loadError")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href="">
              {t("SchedulePage.retry")}
            </Button>
          </p>
        </Alert>
      ) : groups.length === 0 ? (
        <EmptyState>{t("SchedulePage.empty")}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.day}
              className="mds-card flex flex-col"
              aria-labelledby={`day-${group.day}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 className="mds-h3" id={`day-${group.day}`}>
                  {formatDayHeading(group.day, locale, timeZone)}
                </h2>
                <span className="mds-caption">
                  {relativeText(dayLabel(group.day, window.today), t)}
                </span>
              </div>
              <ul className="m-0 flex list-none flex-col p-0 mbs-2">
                {group.sessions.map((session) => (
                  <ScheduleRow
                    key={session.id}
                    session={session}
                    now={now}
                    t={t}
                    locale={locale}
                    timeZone={timeZone}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <nav
        className="flex flex-wrap items-center justify-center gap-3"
        aria-label={t("SchedulePage.listLabel")}
      >
        {window.fromDay !== window.today ? (
          <Button variant="ghost" href="/schedule">
            {t("SchedulePage.backToToday")}
          </Button>
        ) : null}
        <Button
          variant="secondary"
          href={`/schedule?from=${window.nextFromDay}`}
        >
          {t("SchedulePage.next")}
        </Button>
      </nav>
    </main>
  );
};
