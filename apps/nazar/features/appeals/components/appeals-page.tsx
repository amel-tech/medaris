import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { appealRows } from "../appeals";
import { AppealsTable } from "./appeals-table";

/**
 * İtirazlar (nazar, W5): the medrese's course requests a köşk refused, with
 * the appeal opened against each and its outcome. A row without an appeal
 * offers "İtiraz aç". A caller without `madrasah.appeal_open` is refused by
 * the API, which is the "no access" notice; no refused request is the empty
 * state.
 */
export async function AppealsPage({ madrasahId }: { madrasahId: string }) {
  const [t, rows] = await Promise.all([
    getMessages("nazar"),
    readOnce("the medrese's appeals", (api) =>
      api.madrasahs.listMadrasahAppeals({ id: madrasahId })
    ),
  ]);

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("Appeals.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">{t("Appeals.caption")}</p>
      </header>
      {rows.status !== "ok" ? (
        <PageProblem
          status={rows.status}
          failed={{
            title: t("Appeals.loadFailedTitle"),
            text: t("Appeals.loadFailed"),
          }}
        />
      ) : rows.data.length === 0 ? (
        <EmptyState data-testid="appeals-empty">
          {t("Appeals.empty")}
        </EmptyState>
      ) : (
        <AppealsTable madrasahId={madrasahId} rows={appealRows(rows.data)} />
      )}
    </>
  );
}

/** The page while the appeals are read: the heading and the table as bars. */
export async function AppealsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="14rem" height="2.5rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="3.5rem" />
      ))}
    </output>
  );
}
