import { Alert } from "@medaris/ui/mds/alert";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { pageScope } from "~/features/shell/page-scope";
import { runsMedrese } from "~/features/shell/scope";
import { dayFormat } from "~/lib/dates";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { awaitingNotice, nazirRows } from "../nazirs";
import { groupSummary } from "../permissions";
import { AppointNazir } from "./appoint-nazir";
import { NazirsTable } from "./nazirs-table";
import { PermissionGroups } from "./permission-groups";

/**
 * Medrese nazırları (nazir 05): who holds the nazır role in the medrese, with
 * their groups, single permissions, end and giver, and the band that names a
 * nazır who has not received a permission yet. The medrese's başmüderris and
 * the başnazım open the page and run it (`runsMedrese`), and so does a nazır
 * given "Medrese nazırı ata", who appoints but
 * gives nothing and dismisses only the nazırs they seated: the table and the
 * groups draw only those buttons for them (MDRS-108). The API refuses any
 * other nazır of the medrese, so that answer is a notice, not a table, and the
 * button that appoints is left out with it. Under the table are the medrese's
 * permission groups (nazir 16); the buttons that edit a nazır's permissions
 * (nazir 06) are in the table.
 */
export async function NazirsPage({ madrasahId }: { madrasahId: string }) {
  const [t, locale, me, scope, nazirs, groups] = await Promise.all([
    getMessages("nazar"),
    getLocale(),
    getViewer(),
    pageScope("medrese", madrasahId),
    readOnce("the medrese's nazırs", (api) =>
      api.madrasahs.getMadrasahNazirs({ id: madrasahId })
    ),
    readOnce("the medrese's permission groups", (api) =>
      api.madrasahs.getMadrasahPermissionGroups({ id: madrasahId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const madrasahName = scope?.name ?? "";
  const manages = runsMedrese(scope, me?.roles.systemAdmin === true);

  const notice =
    nazirs.status === "ok"
      ? awaitingNotice(nazirs.data, t, { locale, timeZone })
      : null;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("Nazirs.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">{t("Nazirs.intro")}</p>
        </div>
        {nazirs.status === "ok" ? (
          <AppointNazir
            madrasahId={madrasahId}
            madrasahName={madrasahName}
            held={nazirs.data.map((n) => n.user.id.toLowerCase())}
          />
        ) : null}
      </header>
      {nazirs.status !== "ok" ? (
        <PageProblem
          status={nazirs.status}
          failed={{
            title: t("Nazirs.loadFailedTitle"),
            text: t("Nazirs.loadFailed"),
          }}
        />
      ) : (
        <>
          {notice ? (
            <Alert tone="warning" title={notice.title}>
              <p>{notice.text}</p>
            </Alert>
          ) : null}
          <NazirsTable
            rows={nazirRows(nazirs.data, t, dayFormat(locale, timeZone))}
            madrasahId={madrasahId}
            madrasahName={madrasahName}
            locale={locale}
            timeZone={timeZone}
            viewer={{ manages, id: me?.id ?? null }}
          />
          {groups.status === "ok" ? (
            <PermissionGroups
              madrasahId={madrasahId}
              madrasahName={madrasahName}
              manages={manages}
              cards={groups.data.map((group) => ({
                group,
                summary: groupSummary(group.permissions, t),
                usage: t("Groups.usage", {
                  count: group.permissions.length,
                  users: group.userCount,
                }),
              }))}
            />
          ) : (
            <Alert tone="error">
              <p>{t("Groups.sectionFailed")}</p>
            </Alert>
          )}
        </>
      )}
    </>
  );
}

/** The page while the nazırs are read: the shell stays, and the table is bars (nazir 05 §3). */
export async function NazirsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      <Skeleton height="4rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="3.5rem" />
      ))}
      <Skeleton width="12rem" height="2rem" />
      <Skeleton height="8rem" />
    </output>
  );
}
