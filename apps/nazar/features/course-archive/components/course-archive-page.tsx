import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import {
  ARCHIVE_PAGE_SIZE,
  archiveRows,
  pageWindow,
} from "~/features/archive/archive";
import { ArchiveList } from "~/features/archive/components/archive-list";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages, type Messages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  COURSE_ARCHIVE_TABS,
  type CourseArchiveTab,
  courseArchiveHref,
  courseTabOf,
} from "../course-archive";

/**
 * Arşiv of a course (MDRS-143): the weeks and sessions hidden in it, by tab,
 * newest first, with "Geri al" for whoever hid a row or a level above. The
 * course's team opens it (`week.hide`: the müderrisler, the köşk's nazımları, a
 * ders nazırı once given it); the API refuses anyone else, and that answer is a
 * notice. The table is the medrese Arşiv's, so a row says who hid it and, when
 * the caller's kademe is below, why there is no button.
 */
export async function CourseArchivePage({
  courseId,
  tabParam,
  page,
}: {
  courseId: string;
  tabParam: string | undefined;
  page: number;
}) {
  const tab = courseTabOf(tabParam);
  const [t, locale, me, archive] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    readOnce("the course's archive", (api) =>
      api.archive.listCourseArchive({
        id: courseId,
        types: tab.types,
        page,
        limit: ARCHIVE_PAGE_SIZE,
      })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("CourseArchive.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("CourseArchive.intro")}
        </p>
      </header>
      {archive.status !== "ok" ? (
        <PageProblem
          status={archive.status}
          failed={{
            title: t("Archive.loadFailedTitle"),
            text: t("Archive.loadFailed"),
          }}
        />
      ) : (
        <ArchiveList
          active={tab.id}
          tabs={COURSE_ARCHIVE_TABS.map((candidate) => ({
            id: candidate.id,
            label: t(`CourseArchive.tabs.${candidate.id}`),
            count: candidate.count(archive.data.counts),
            href: courseArchiveHref(courseId, candidate, 1),
          }))}
          rows={archiveRows(archive.data.items, t, {
            locale,
            timeZone,
            now: new Date(),
            viewerId: me?.id,
          })}
          empty={t(`CourseArchive.empty.${tab.id}`)}
          pager={pagerOf(courseId, tab, archive.data, t)}
        />
      )}
    </>
  );
}

function pagerOf(
  courseId: string,
  tab: CourseArchiveTab,
  data: { total: number; page: number; limit: number },
  t: Messages
) {
  const window = pageWindow(data.total, data.page, data.limit);
  if (!window.hasPrevious && !window.hasNext) return null;
  return {
    range: t("Archive.pager.range", {
      from: window.from,
      to: window.to,
      total: data.total,
    }),
    previousHref: window.hasPrevious
      ? courseArchiveHref(courseId, tab, data.page - 1)
      : null,
    nextHref: window.hasNext
      ? courseArchiveHref(courseId, tab, data.page + 1)
      : null,
  };
}

/** The page while the archive is read: the shell stays, and the list is bars. */
export async function CourseArchiveLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="3.5rem" />
      ))}
    </output>
  );
}
