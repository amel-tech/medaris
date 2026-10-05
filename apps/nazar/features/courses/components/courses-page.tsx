import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  counterOf,
  courseRows,
  type Filters,
  genitive,
  hostLine,
  koskOptions,
  offsiteRequestHref,
  openCourseHref,
  statusOptions,
} from "../courses";
import { CoursesTable } from "./courses-table";

function SideCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mds-card flex flex-col gap-4 p-card"
    >
      <h2 className="mds-h3" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Dersler (nazir 07): the medrese's own courses with the köşk they were opened
 * in, their müderrisler, talebe and state, narrowed by köşk and state, and at
 * the side the köşks the medrese may open a course in. The medrese's
 * başmüderris opens the page; the API refuses a nazır of the medrese today (the
 * role matrix has no row for MEDRESE_NAZIR), so that answer is a notice and
 * the buttons that open a course are left out with the list. The köşks are a
 * side list: if they cannot be read, their card says so, the köşk filter keeps
 * only "tümü" and "Medrese dersi aç" stays on, since nothing says it cannot
 * work. Where the API says there is no köşk at all, the button is off and the
 * card says why.
 */
export async function CoursesPage({
  madrasahId,
  filters,
}: {
  madrasahId: string;
  filters: Filters;
}) {
  const [t, locale, me, portal, courses, hosting] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the medrese's courses", (api) =>
      api.madrasahs.getMadrasahCourses({
        id: madrasahId,
        koskId: filters.kosk ?? undefined,
        status: filters.status ?? undefined,
      })
    ),
    readOnce("the medrese's hosting köşks", (api) =>
      api.madrasahs.getMadrasahHostingKosks({ id: madrasahId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const scopes = portal.status === "ok" ? portal.scopes : [];
  const madrasahName = findScope(scopes, "medrese", madrasahId)?.name ?? "";
  const held = new Set(
    scopes.filter((s) => s.kind === "ders").map((s) => s.id.toLowerCase())
  );
  const kosks = hosting.status === "ok" ? hosting.data : [];
  const canOpen = hosting.status !== "ok" || kosks.length > 0;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Courses.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">
            {madrasahName
              ? t("Courses.subtitle", {
                  name: madrasahName,
                  nameGenitive: genitive(madrasahName, locale),
                })
              : t("Courses.subtitleUnnamed")}
          </p>
        </div>
        {courses.status === "ok" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button href={offsiteRequestHref(madrasahId)} variant="outline">
              {t("Courses.offsite")}
            </Button>
            <Button
              href={openCourseHref(madrasahId)}
              iconLeft={<Icon name="plus" size="sm" />}
              disabled={!canOpen}
            >
              {t("Courses.open")}
            </Button>
          </div>
        ) : null}
      </header>
      {courses.status !== "ok" ? (
        <PageProblem
          status={courses.status}
          failed={{
            title: t("Courses.loadFailedTitle"),
            text: t("Courses.loadFailed"),
          }}
        />
      ) : (
        <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
          <div className="flex min-inline-0 flex-col gap-3">
            <CoursesTable
              madrasahId={madrasahId}
              madrasahName={madrasahName}
              rows={courseRows(courses.data, t, {
                locale,
                timeZone,
                now: new Date(),
                held,
              })}
              counter={counterOf(courses.data, t)}
              filters={filters}
              koskOptions={koskOptions(kosks, t)}
              statusOptions={statusOptions(t)}
            />
            <p className="mds-caption">
              {t("Courses.hiddenNote.before")}
              <Link
                href={`/medrese/${encodeURIComponent(madrasahId)}/arsiv`}
                className="underline underline-offset-4"
              >
                {t("Courses.hiddenNote.link")}
              </Link>
              {t("Courses.hiddenNote.after")}
            </p>
          </div>
          <div className="flex min-inline-0 flex-col gap-grid">
            <SideCard id="hosts-heading" title={t("Courses.hosts.title")}>
              {hosting.status !== "ok" ? (
                <Alert tone="error">
                  <p>{t("Courses.hosts.failed")}</p>
                </Alert>
              ) : kosks.length === 0 ? (
                <p>{t("Courses.hosts.none")}</p>
              ) : (
                <ul className="flex flex-col" data-testid="hosting-kosks">
                  {kosks.map((kosk) => (
                    <li
                      key={kosk.id}
                      className="flex items-start gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
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
              <p>{t("Courses.hosts.text")}</p>
            </SideCard>
            <SideCard id="outside-heading" title={t("Courses.outside.title")}>
              <p>{t("Courses.outside.text")}</p>
            </SideCard>
          </div>
        </div>
      )}
    </>
  );
}

/** The page while the courses are read: the shell stays, and the table is bars (nazir 07 §3). */
export async function CoursesLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex flex-col gap-4">
          <Skeleton height="2.5rem" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} height="4.5rem" />
          ))}
        </div>
        <div className="flex flex-col gap-grid">
          <Skeleton height="12rem" />
          <Skeleton height="10rem" />
        </div>
      </div>
    </output>
  );
}
