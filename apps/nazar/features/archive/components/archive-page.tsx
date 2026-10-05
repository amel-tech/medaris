import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages, type Messages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  ARCHIVE_PAGE_SIZE,
  ARCHIVE_TABS,
  archiveHref,
  archiveRows,
  medreseRestoreOf,
  pageWindow,
  tabOf,
} from "../archive";
import { ArchiveList } from "./archive-list";
import { HideMadrasah } from "./hide-madrasah";
import { RestoreMadrasah } from "./restore-madrasah";

/**
 * Arşiv (nazir 12): what is hidden in the medrese (its courses, and the weeks
 * and sessions in them) by tab, newest first, with "Geri al" and, under it,
 * "Medreseyi gizle". The medrese's başmüderris opens the page, and so does a
 * nazır given `madrasah.course_hide` or `madrasah.settings_edit` (and Medaris
 * yönetimi); a refusal is a notice, and "Medreseyi gizle" is left out with the
 * list. "Medreseyi gizle" is the başmüderris's alone: `madrasah.hide` is no
 * grant, so a nazır is not shown a button the API answers with 403 (MDRS-108).
 * A medrese that is hidden says so in a banner above the list, with "Medreseyi
 * geri getir" for whoever hid it or a level above, and offers no "Medreseyi
 * gizle" (MDRS-143). Which tab and which page are in the address (`?tur=`,
 * `?sayfa=`), so a page can be linked to and the tabs are links.
 */
export async function ArchivePage({
  madrasahId,
  tabParam,
  page,
}: {
  madrasahId: string;
  tabParam: string | undefined;
  page: number;
}) {
  const tab = tabOf(tabParam);
  const [t, locale, me, portal, archive] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the medrese's archive", (api) =>
      api.archive.listMadrasahArchive({
        id: madrasahId,
        types: tab.types,
        page,
        limit: ARCHIVE_PAGE_SIZE,
      })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const scope =
    portal.status === "ok"
      ? findScope(portal.scopes, "medrese", madrasahId)
      : undefined;
  const madrasahName = scope?.name ?? "";
  const mayHide = scope?.role === "MEDRESE_BASMUDERRIS";

  const medreseRestore =
    archive.status === "ok"
      ? medreseRestoreOf(archive.data.madrasah, t, locale)
      : null;

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Archive.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">{t("Archive.intro")}</p>
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
        <>
          {archive.data.madrasah.hidden ? (
            <RestoreMadrasah
              madrasahId={madrasahId}
              madrasahName={madrasahName}
              lockedNote={
                medreseRestore?.kind === "note" ? medreseRestore.text : null
              }
            />
          ) : null}
          <ArchiveList
            active={tab.id}
            tabs={ARCHIVE_TABS.map((candidate) => ({
              id: candidate.id,
              label: t(`Archive.tabs.${candidate.id}`),
              count: candidate.count(archive.data.counts),
              href: archiveHref(madrasahId, candidate, 1),
            }))}
            rows={archiveRows(archive.data.items, t, {
              locale,
              timeZone,
              now: new Date(),
              viewerId: me?.id,
            })}
            empty={t(`Archive.empty.${tab.id}`)}
            pager={pagerOf(madrasahId, tab, archive.data, t)}
          />
          {mayHide && !archive.data.madrasah.hidden ? (
            <HideMadrasah madrasahId={madrasahId} madrasahName={madrasahName} />
          ) : null}
        </>
      )}
    </>
  );
}

function pagerOf(
  madrasahId: string,
  tab: ReturnType<typeof tabOf>,
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
      ? archiveHref(madrasahId, tab, data.page - 1)
      : null,
    nextHref: window.hasNext
      ? archiveHref(madrasahId, tab, data.page + 1)
      : null,
  };
}

/** The page while the archive is read: the shell stays, and the list is bars (nazir 12 §3). */
export async function ArchiveLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <Skeleton height="2.5rem" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="3.5rem" />
      ))}
      <Skeleton height="6rem" />
    </output>
  );
}
