import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { genitive } from "~/features/courses/courses";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  counterOf,
  courseOptions,
  type Filters,
  lastPage,
  listRequest,
  pagerOf,
  statusOptions,
  studentRows,
  studentsHref,
} from "../students";
import { StudentsTable } from "./students-table";

/**
 * Talebeler (nazir 10): everyone with a seat in one of the medrese's courses,
 * newest first, ten to a page, narrowed by name, course and state. The
 * medrese's başmüderris opens the page; the API refuses a nazır of the medrese
 * today (the role matrix has no row for MEDRESE_NAZIR), so that answer is a
 * notice. The courses are a side read for the course filter: if they cannot be
 * read, the filter keeps only "Bütün dersler". A page past the last (a stale
 * link) goes to the last one.
 */
export async function StudentsPage({
  madrasahId,
  filters,
}: {
  madrasahId: string;
  filters: Filters;
}) {
  const [t, locale, me, portal, students, courses] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the medrese's talebe", (api) =>
      api.madrasahs.getMadrasahStudents({
        id: madrasahId,
        ...listRequest(filters),
      })
    ),
    readOnce("the medrese's courses", (api) =>
      api.madrasahs.getMadrasahCourses({ id: madrasahId })
    ),
  ]);
  if (
    students.status === "ok" &&
    students.data.items.length === 0 &&
    students.data.total > 0 &&
    filters.page > 1
  ) {
    redirect(
      studentsHref(madrasahId, {
        ...filters,
        page: lastPage(students.data.total, students.data.limit),
      })
    );
  }
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const madrasahName =
    (portal.status === "ok"
      ? findScope(portal.scopes, "medrese", madrasahId)?.name
      : undefined) ?? "";

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Students.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {madrasahName
            ? t("Students.subtitle", {
                name: madrasahName,
                nameGenitive: genitive(madrasahName, locale),
              })
            : t("Students.subtitleUnnamed")}
        </p>
      </header>
      {students.status !== "ok" ? (
        <PageProblem
          status={students.status}
          failed={{
            title: t("Students.loadFailedTitle"),
            text: t("Students.loadFailed"),
          }}
        />
      ) : (
        <StudentsTable
          madrasahId={madrasahId}
          madrasahName={madrasahName}
          rows={studentRows(students.data.items, t, {
            locale,
            timeZone,
            now: new Date(),
          })}
          filters={filters}
          courseOptions={courseOptions(
            courses.status === "ok" ? courses.data : [],
            t
          )}
          statusOptions={statusOptions(t)}
          counter={counterOf(students.data.total, t, locale)}
          pager={
            students.data.total > 0
              ? pagerOf(madrasahId, filters, students.data, t, locale)
              : null
          }
        />
      )}
    </>
  );
}

/** The page while the talebe are read: the shell stays, and the table is bars (nazir 10 §3). */
export async function StudentsLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="2.5rem" />
      {[0, 1, 2, 3, 4].map((row) => (
        <Skeleton key={row} height="3rem" />
      ))}
    </output>
  );
}
