import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { getTranslations } from "next-intl/server";
import {
  type DiscoverQuery,
  discoverHref,
  hasFilter,
  pageCount,
} from "../discover-query";
import type { DiscoverData } from "../reads";
import { DiscoverFilters } from "./discover-filters";
import { KoskCard } from "./kosk-card";
import { MadrasahCard } from "./madrasah-card";

/** Where "Köşk açma başvurusu" leads (design tedris/37, a later package). */
export const KOSK_APPLICATION_HREF = "/kosk-applications/new";

const Pagination = ({
  query,
  total,
  t,
}: {
  query: DiscoverQuery;
  total: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) => {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={t("DiscoverPage.pages")}
      className="flex items-center justify-center gap-4"
    >
      {query.page > 1 ? (
        <Button
          variant="outline"
          size="small"
          href={discoverHref({ ...query, page: query.page - 1 })}
          rel="prev"
        >
          {t("DiscoverPage.prev")}
        </Button>
      ) : null}
      <span className="mds-caption" aria-current="page">
        {t("DiscoverPage.pageOf", { page: query.page, total: pages })}
      </span>
      {query.page < pages ? (
        <Button
          variant="outline"
          size="small"
          href={discoverHref({ ...query, page: query.page + 1 })}
          rel="next"
        >
          {t("DiscoverPage.next")}
        </Button>
      ) : null}
    </nav>
  );
};

/**
 * Keşfet (MDRS-159, design tedris/02): the listed köşks and medreses, with the
 * level, medrese and ilim alanı filters and a search, and below them the way
 * to ask for a new köşk. A failed read is an Alert with a way to try again,
 * never an empty list.
 */
export const DiscoverPage = async ({
  query,
  data,
  failed = false,
}: {
  query: DiscoverQuery;
  data: DiscoverData | null;
  failed?: boolean;
}) => {
  const t = await getTranslations("tedris");

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex min-inline-0 flex-col gap-3">
        <h1 className="mds-h1">{t("DiscoverPage.title")}</h1>
        <p className="mds-body">{t("DiscoverPage.subtitle")}</p>
      </div>

      {failed || data === null ? (
        <Alert tone="error" title={t("DiscoverPage.loadErrorTitle")}>
          <p>{t("DiscoverPage.loadError")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href={discoverHref(query)}>
              {t("DiscoverPage.retry")}
            </Button>
          </p>
        </Alert>
      ) : (
        <>
          <div className="flex min-inline-0 flex-col gap-3">
            <DiscoverFilters
              query={query}
              fields={data.fields}
              madrasahs={data.allMadrasahs.map((m) => ({
                id: m.id,
                name: m.name,
              }))}
              labels={{
                filters: t("DiscoverPage.filters"),
                search: t("DiscoverPage.searchLabel"),
                searchPlaceholder: t("DiscoverPage.searchPlaceholder"),
                level: t("DiscoverPage.levelLabel"),
                allLevels: t("DiscoverPage.allLevels"),
                madrasah: t("DiscoverPage.madrasahLabel"),
                allMadrasahs: t("DiscoverPage.allMadrasahs"),
                field: t("DiscoverPage.fieldLabel"),
                allFields: t("DiscoverPage.allFields"),
                levelNames: {
                  BEGINNER: t("Levels.BEGINNER"),
                  INTERMEDIATE: t("Levels.INTERMEDIATE"),
                  ADVANCED: t("Levels.ADVANCED"),
                },
              }}
            />
            <output className="mds-caption" aria-live="polite">
              {t("DiscoverPage.resultCount", {
                kosks: data.koskTotal,
                madrasahs: data.madrasahs.length,
              })}
            </output>
          </div>

          {data.koskTotal === 0 && data.madrasahs.length === 0 ? (
            <EmptyState
              action={
                hasFilter(query) ? (
                  <Button variant="outline" href="?">
                    {t("DiscoverPage.clearFilters")}
                  </Button>
                ) : undefined
              }
            >
              {t("DiscoverPage.empty")}
            </EmptyState>
          ) : (
            <>
              {data.koskTotal > 0 ? (
                <section
                  className="flex min-inline-0 flex-col gap-4"
                  aria-labelledby="discover-kosks"
                >
                  <h2 className="mds-h2" id="discover-kosks">
                    {t("DiscoverPage.kosks")}
                  </h2>
                  <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
                    {data.kosks.map((kosk) => (
                      <KoskCard key={kosk.id} kosk={kosk} t={t} />
                    ))}
                  </div>
                  <Pagination query={query} total={data.koskTotal} t={t} />
                </section>
              ) : null}
              {data.madrasahs.length > 0 ? (
                <section
                  className="flex min-inline-0 flex-col gap-4"
                  aria-labelledby="discover-madrasahs"
                >
                  <h2 className="mds-h2" id="discover-madrasahs">
                    {t("DiscoverPage.madrasahs")}
                  </h2>
                  <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
                    {data.madrasahs.map((madrasah) => (
                      <MadrasahCard
                        key={madrasah.id}
                        madrasah={madrasah}
                        t={t}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}

          <Card className="flex flex-row flex-wrap items-center justify-between gap-4">
            <p className="mds-body-sm">{t("DiscoverPage.applyNotice")}</p>
            <Button variant="outline" href={KOSK_APPLICATION_HREF}>
              {t("DiscoverPage.applyLink")}
            </Button>
          </Card>
        </>
      )}
    </main>
  );
};
