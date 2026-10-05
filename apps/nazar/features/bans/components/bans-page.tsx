import { Alert } from "@medaris/ui/mds/alert";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getPortal } from "~/features/shell/reads";
import { findScope } from "~/features/shell/scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { banRows, type Filters, listRequest, scopeOptions } from "../bans";
import { BanButton } from "./ban-dialog";
import { BansTable } from "./bans-table";

/**
 * Yasaklamalar (nazir 11): the bans on the medrese's courses and over the
 * medrese, active or lifted, with the reason, who placed each and when, and
 * what the caller may do about it. The medrese's başmüderris opens the page;
 * the API refuses a nazır of the medrese today (the role matrix has no row for
 * MEDRESE_NAZIR), so that answer is a notice and "Yasakla" is left out with the
 * list. The medrese's courses are a side read: the scope filter and the choices
 * of "Yasakla" use them, and if they cannot be read the filter keeps "Bütün
 * kapsamlar" and "Medrese düzeyi" and the dialog offers only the whole medrese.
 * The counts of the tabs are the medrese's whole, whatever the filter narrows.
 */
export async function BansPage({
  madrasahId,
  filters,
}: {
  madrasahId: string;
  filters: Filters;
}) {
  const [t, locale, me, portal, bans, courses] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    getPortal(),
    readOnce("the medrese's bans", (api) =>
      api.bans.listMadrasahBans({ id: madrasahId, ...listRequest(filters) })
    ),
    readOnce("the medrese's courses", (api) =>
      api.madrasahs.getMadrasahCourses({ id: madrasahId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const madrasahName =
    (portal.status === "ok"
      ? findScope(portal.scopes, "medrese", madrasahId)?.name
      : undefined) ?? "";
  const choices =
    courses.status === "ok"
      ? courses.data.map((course) => ({ id: course.id, title: course.title }))
      : [];

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Bans.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">{t("Bans.intro")}</p>
        </div>
        {bans.status === "ok" ? (
          <BanButton
            madrasahId={madrasahId}
            madrasahName={madrasahName}
            courses={choices}
            coursesFailed={courses.status !== "ok"}
          />
        ) : null}
      </header>
      {bans.status !== "ok" ? (
        <PageProblem
          status={bans.status}
          failed={{
            title: t("Bans.loadFailedTitle"),
            text: t("Bans.loadFailed"),
          }}
        />
      ) : (
        <>
          <Alert title={t("Bans.kademe.title")}>
            <p>{t("Bans.kademe.text")}</p>
          </Alert>
          <BansTable
            madrasahId={madrasahId}
            madrasahName={madrasahName}
            rows={banRows(bans.data.items, t, {
              locale,
              timeZone,
              now: new Date(),
              madrasahName,
              viewerId: me?.id,
            })}
            filters={filters}
            tabs={[
              { status: "ACTIVE", count: bans.data.activeCount },
              { status: "LIFTED", count: bans.data.liftedCount },
            ]}
            scopeOptions={scopeOptions(choices, t)}
          />
        </>
      )}
    </>
  );
}

/** The page while the bans are read: the shell stays, and the list is bars (nazir 11 §3). */
export async function BansLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="14rem" height="2.5rem" />
      <Skeleton height="4rem" />
      <Skeleton height="2.5rem" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height="4.5rem" />
      ))}
    </output>
  );
}
