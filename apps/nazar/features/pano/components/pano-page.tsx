import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { getViewer } from "~/features/account/reads";
import {
  hostLine,
  offsiteRequestHref,
  openCourseHref,
} from "~/features/courses/courses";
import { PageProblem } from "~/features/shell/components/page-problem";
import { pageScope } from "~/features/shell/page-scope";
import { getPortal } from "~/features/shell/reads";
import { openableCourses } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { applicationRows, courseCards, greetingOf, sessionRows } from "../pano";
import { ApplicationsPanel, SessionsTable } from "./pano-tables";

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex min-inline-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="mds-h2" id={id}>
          {title}
        </h2>
        {hint ? <p className="mds-caption">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * The Pano (nazir 01): the medrese's dashboard. A greeting that counts the
 * sessions of the next seven days and the applications waiting, "Kapsamlarınız"
 * (the medrese and every course the caller holds a scope in), the sessions to
 * come, the applications to decide and the köşks that host the medrese. The
 * scope cards come from the caller's assignments and so are drawn whatever the
 * dashboard answers; everything else is the one `GET /madrasahs/:id/dashboard`.
 * The medrese's başmüderris reads it; the API refuses a nazır of the medrese
 * today (the role matrix has no row for MEDRESE_NAZIR), so that answer is a
 * notice under the cards and "Medrese dersi aç" is left out with the rest.
 */
export async function PanoPage({ madrasahId }: { madrasahId: string }) {
  const [t, locale, me, portal, medrese, dashboard] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    getPortal(),
    pageScope("medrese", madrasahId),
    readOnce("the medrese's dashboard", (api) =>
      api.madrasahs.getMadrasahDashboard({ id: madrasahId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const scopes = portal.status === "ok" ? portal.scopes : [];
  const assignments = portal.status === "ok" ? portal.assignments : [];
  const data = dashboard.status === "ok" ? dashboard.data : null;
  const held = openableCourses(
    scopes,
    me?.roles.systemAdmin === true,
    data ? data.upcomingSessions.map((session) => session.courseId) : []
  );
  const numbers = new Intl.NumberFormat(locale);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Pano.title")}</h1>
          <p className="mds-body-sm text-neutral-muted" data-testid="greeting">
            {greetingOf(
              me?.givenName,
              data
                ? {
                    sessions: data.upcomingSessions.length,
                    applications: data.pendingApplicationCount,
                  }
                : null,
              t
            )}
          </p>
        </div>
        {data ? (
          <Button
            href={openCourseHref(madrasahId)}
            iconLeft={<Icon name="plus" size="sm" />}
            disabled={data.hostingKosks.length === 0}
          >
            {t("Pano.open")}
          </Button>
        ) : null}
      </header>

      <Section
        id="scopes-heading"
        title={t("Pano.scopesTitle")}
        hint={t("Pano.scopesHint")}
      >
        <div
          className="grid gap-grid md:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))]"
          data-testid="scopes"
        >
          {medrese ? (
            <Card
              title={
                <span className="flex min-inline-0 items-center gap-3">
                  <Avatar name={medrese.name} entity size="lg" decorative />
                  <bdi>{medrese.name}</bdi>
                </span>
              }
              footer={
                data
                  ? t("Pano.madrasah.courses", {
                      courses: numbers.format(data.courseCount),
                      kosks: numbers.format(data.hostingKosks.length),
                    })
                  : undefined
              }
            >
              <p className="mds-card__body">{t(`Roles.${medrese.role}`)}</p>
              {data ? (
                <p className="mds-card__body">
                  {t("Pano.madrasah.nazirs", {
                    count: numbers.format(data.nazirCount),
                  })}
                </p>
              ) : null}
            </Card>
          ) : null}
          {courseCards(scopes, assignments, t, locale).map((course) => (
            <Card
              key={course.id}
              href={course.href}
              title={<bdi>{course.title}</bdi>}
              action={
                course.state ? (
                  <Badge variant={course.state.variant}>
                    {course.state.label}
                  </Badge>
                ) : undefined
              }
              media={<CoverPattern seed={course.id} size="sm" />}
              footer={course.footer ? <bdi>{course.footer}</bdi> : undefined}
            >
              <p className="mds-card__body">{course.role}</p>
            </Card>
          ))}
        </div>
      </Section>

      {dashboard.status !== "ok" || !data ? (
        <PageProblem
          status={dashboard.status === "ok" ? "failed" : dashboard.status}
          failed={{
            title: t("Pano.loadFailedTitle"),
            text: t("Pano.loadFailed"),
          }}
        />
      ) : (
        <>
          <Section
            id="sessions-heading"
            title={t("Pano.sessions.title")}
            hint={t("Pano.sessions.hint")}
          >
            <SessionsTable
              rows={sessionRows(data.upcomingSessions, t, {
                locale,
                timeZone,
                held,
              })}
            />
          </Section>
          <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
            <ApplicationsPanel
              // a fresh read starts from its own counters, with nothing decided yet
              key={`${data.pendingApplicationCount}:${data.pendingApplications
                .map((a) => `${a.courseId}${a.userId}`)
                .join()}`}
              rows={applicationRows(data.pendingApplications, t, {
                locale,
                timeZone,
                now: new Date(),
              })}
              total={data.pendingApplicationCount}
              courses={data.pendingCourseCount}
            />
            <Section id="hosts-heading" title={t("Pano.hosts.title")}>
              <Card
                footer={
                  <a
                    href={offsiteRequestHref(madrasahId)}
                    className="underline underline-offset-4"
                  >
                    {t("Pano.hosts.offsite")}
                  </a>
                }
              >
                {data.hostingKosks.length === 0 ? (
                  <p className="mds-card__body">{t("Pano.hosts.none")}</p>
                ) : (
                  <ul className="flex flex-col" data-testid="hosting-kosks">
                    {data.hostingKosks.map((kosk) => (
                      <li
                        key={kosk.id}
                        className="flex items-start gap-3 py-3 border-be border-neutral-subtle first:pt-0 last:border-be-0"
                      >
                        <Avatar name={kosk.name} entity decorative />
                        <span className="flex min-inline-0 flex-col">
                          <bdi className="font-medium">{kosk.name}</bdi>
                          <span className="mds-caption">
                            <bdi>{hostLine(kosk, t)}</bdi>
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mds-card__body">{t("Pano.hosts.text")}</p>
              </Card>
            </Section>
          </div>
        </>
      )}
    </>
  );
}

/** The page while the dashboard is read: the shell stays, and the cards and tables are bars (nazir 01 §3). */
export async function PanoLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="10rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-3">
        <Skeleton height="10rem" />
        <Skeleton height="10rem" />
        <Skeleton height="10rem" />
      </div>
      <Skeleton height="9rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <Skeleton height="12rem" />
        <Skeleton height="12rem" />
      </div>
    </output>
  );
}
