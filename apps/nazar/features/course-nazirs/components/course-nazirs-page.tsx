import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import {
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { dayFormat } from "~/lib/dates";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  appointsOnly,
  courseNazirRows,
  courseNazirsContext,
} from "../course-nazirs";
import { AppointCourseNazir } from "./course-nazir-dialog";
import { CourseNazirsTable } from "./course-nazirs-table";

/**
 * Ders nazırları (MDRS-270): who holds the ders nazırı post in the course,
 * with the permissions the post carries, its end and who appointed them. The
 * page opens for a caller who holds `course_nazir.assign` in this course,
 * read from `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya
 * izniniz yok", a permissions read that failed is the retry state, and the
 * list is read for neither. What the caller may do comes from the list
 * itself: "Ders nazırı ata" when it says they may appoint, the boxes they may
 * tick, and on each row "İzinleri düzenle" and "Görevden al" when the row
 * says so. A holder of `course_nazir.assign` by a grant appoints with no
 * permission and dismisses only their own appointees. The API decides every
 * write again, and its refusal is worded from the code.
 */
export async function CourseNazirsPage({ courseId }: { courseId: string }) {
  const [t, locale, me, permissions] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([], permissions, PAGE_CODES.nazirs);
  const list =
    gate === "ok"
      ? await readOnce("the course's ders nazırları", (api) =>
          api.courses.getCourseNazirs({ id: courseId })
        )
      : null;
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const viewerId = me?.id ?? null;
  const data = list?.status === "ok" ? list.data : null;
  const refused = gate === "forbidden" || list?.status === "forbidden";
  const context = data
    ? courseNazirsContext(data, { courseId, timeZone, viewerId })
    : null;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("CourseNazirs.title")}</h1>
          {data ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("CourseNazirs.intro", { course: data.course.title })}
            </p>
          ) : null}
          {data && appointsOnly(data) ? (
            <p className="mds-body-sm text-neutral-muted">
              {t("CourseNazirs.introAppointOnly")}
            </p>
          ) : null}
        </div>
        {data?.mayAppoint && context ? (
          <AppointCourseNazir context={context} />
        ) : null}
      </header>
      {data === null || context === null ? (
        <PageProblem
          status={refused ? "forbidden" : "failed"}
          failed={{
            title: t("CourseNazirs.loadFailedTitle"),
            text: t("CourseNazirs.loadFailed"),
          }}
        />
      ) : (
        <CourseNazirsTable
          rows={courseNazirRows(data, {
            t,
            day: dayFormat(locale, timeZone),
            viewerId,
          })}
          context={context}
        />
      )}
    </>
  );
}

/** The page while the list is read: the shell stays, and the table is bars. */
export async function CourseNazirsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="3.5rem" />
      ))}
    </output>
  );
}
