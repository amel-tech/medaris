"use client";

import type {
  KoskDirectoryItemResponse,
  KoskDirectoryResponse,
  KoskListingFilter,
  KoskStatusFilter,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { dateWithCase } from "../../madrasahs/present";
import { restoreKosk } from "../admin-actions";
import {
  type DirectoryFilters,
  directoryPath,
  handleLabel,
  isNazimOf,
  koskErrorKey,
  LISTING_CHIPS,
  type Messages,
  nazimNames,
  pageCount,
  STATUS_LOOK,
  STATUS_TABS,
  toneOfHue,
  withFilter,
} from "../admin-present";
import { OpenKoskDialog } from "./open-kosk-dialog";

interface Props {
  /** null when the first read failed */
  directory: KoskDirectoryResponse | null;
  filters: DirectoryFilters;
  /** the signed-in person, for the "Siz" under a row they manage */
  viewerId: string | null;
  /** the başnazım opens köşks and brings hidden ones back; a köşk nazımı only reads */
  chief: boolean;
  /** the home page's "Köşk aç" lands here with the form already open (the başnazım's) */
  initialOpen?: boolean;
}

const SEARCH_DELAY_MS = 300;

/**
 * Köşkler (nizam 09): every köşk with its nazımları, course count and status,
 * the status tabs with their counts, a search, the Görünürlük chips and a
 * pager (a köşk's alan and level are not shown or filtered, MDRS-252). The URL is the one source of the
 * filters: a tab, a chip or a search navigates, the server reads again, so
 * the counts and the rows always come from the same answer. "Geri al" brings
 * a hidden köşk back; "Köşk aç" is nizam/10. A köşk nazımı sees only their
 * own köşks and neither button.
 */
export function KosksDirectory({
  directory,
  filters,
  viewerId,
  chief,
  initialOpen = false,
}: Props) {
  const tm = useTranslations("nizam.KoskDirectory");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);
  const [opening, setOpening] = useState(initialOpen && chief);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searched = useRef(filters.q);
  // The filters the page is on or is heading to. `filters` only changes once
  // the server has answered, so a tab, a chip or the pause in typing that
  // builds on it meanwhile would undo the navigation still on its way.
  const heading = useRef(filters);

  // The search follows the URL when it is changed from outside (back button).
  useEffect(() => {
    setSearch(filters.q);
    searched.current = filters.q;
  }, [filters.q]);

  useEffect(() => {
    heading.current = filters;
  }, [filters]);

  const go = (next: DirectoryFilters, replace = false) => {
    heading.current = next;
    startTransition(() => {
      const href = `/${locale}${directoryPath(next)}`;
      if (replace) router.replace(href);
      else router.push(href);
    });
  };
  const change = (patch: Partial<DirectoryFilters>) =>
    go(withFilter(heading.current, patch));

  // Typing navigates after a pause, so a name is one request, not one per key.
  useEffect(() => {
    if (search.trim() === searched.current.trim()) return;
    const timer = setTimeout(() => {
      searched.current = search;
      go(withFilter(heading.current, { q: search.trim() }), true);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const refresh = () => startTransition(() => router.refresh());

  const restore = async (item: KoskDirectoryItemResponse) => {
    setBusyId(item.id);
    const result = await restoreKosk(item.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(t("restoreFailed"), {
        description: t(koskErrorKey(result.errorBody)),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("restored"), {
      description: t("restoredBody", { name: item.name }),
    });
    refresh();
  };

  const counts = directory?.counts;
  const countOf = (value: KoskStatusFilter) =>
    !counts
      ? undefined
      : value === "ALL"
        ? counts.all
        : value === "ACTIVE"
          ? counts.active
          : value === "PASSIVE"
            ? counts.passive
            : counts.hidden;

  const dateOpts = { locale, timeZone, t };

  const columns: TableColumn<KoskDirectoryItemResponse>[] = [
    {
      key: "kosk",
      header: t("columns.kosk"),
      rowHeader: true,
      width: "30%",
      render: (k) => (
        <span className="flex min-w-0 items-center gap-3">
          <CoverPattern tone={toneOfHue(k.coverHue)} size="xs" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <a
                className="mds-link font-semibold"
                href={`/${locale}/kosks/${k.id}`}
              >
                <bdi>{k.name}</bdi>
              </a>
              {k.isPrivate ? (
                <Badge variant="outline" icon={<Icon name="link" size="sm" />}>
                  {t("unlisted")}
                </Badge>
              ) : null}
            </span>
            {handleLabel(k.handle) ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {handleLabel(k.handle)}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "nazims",
      header: t("columns.nazims"),
      width: "27%",
      render: (k) =>
        k.nazims.length === 0 ? (
          <span className="text-neutral-muted">{t("noNazim")}</span>
        ) : (
          <span className="flex flex-col">
            <bdi>{nazimNames(k.nazims, locale, t("unknownPerson"))}</bdi>
            {isNazimOf(k.nazims, viewerId) ? (
              <span className="mds-caption">{t("you")}</span>
            ) : null}
          </span>
        ),
    },
    {
      key: "courses",
      header: t("columns.courses"),
      align: "right",
      width: "7%",
      render: (k) => <span className="tabular-nums">{k.courseCount}</span>,
    },
    {
      key: "status",
      header: t("columns.status"),
      width: "20%",
      render: (k) => {
        const look = STATUS_LOOK[k.status];
        const since =
          k.status === "ACTIVE" || !k.since
            ? null
            : t("since", {
                dateAblative: dateWithCase(
                  new Date(k.since),
                  "ablative",
                  dateOpts
                ),
              });
        return (
          <span className="flex flex-col items-start gap-1">
            {look.badge ? (
              <Badge
                variant={look.badge}
                icon={
                  look.icon ? <Icon name={look.icon} size="sm" /> : undefined
                }
              >
                {t(`status.${k.status}`)}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-2">
                {look.icon ? <Icon name={look.icon} size="sm" /> : null}
                {t(`status.${k.status}`)}
              </span>
            )}
            {since ? <span className="mds-caption">{since}</span> : null}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "14%",
      render: (k) =>
        chief && k.status === "HIDDEN" ? (
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="undo" size="sm" />}
            loading={busyId === k.id}
            aria-label={t("restoreLabel", { name: k.name })}
            onClick={() => void restore(k)}
          >
            {t("restore")}
          </Button>
        ) : null,
    },
  ];

  const rows = directory?.items ?? [];
  const pages = directory ? pageCount(directory.total, directory.limit) : 1;
  const emptyText =
    directory && directory.counts.all === 0 ? t("emptyAll") : t("emptyFilter");

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosks"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        {chief ? (
          <Button
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => setOpening(true)}
          >
            {t("open")}
          </Button>
        ) : null}
      </header>

      <section aria-labelledby="kosks-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="kosks-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {chief ? (
            <a className="mds-link" href={`/${locale}/arsiv`}>
              {t("archive")}
            </a>
          ) : null}
        </div>

        <Tabs
          label={t("tabsLabel")}
          locale={locale}
          value={filters.status}
          onChange={(next) => change({ status: next as KoskStatusFilter })}
          tabs={STATUS_TABS.map((value) => ({
            value,
            label: t(`tabs.${value}`),
            count: countOf(value),
          }))}
        >
          {STATUS_TABS.map((value) => (
            <TabsPanel key={value} value={value} className="pbs-4">
              {value !== filters.status ? null : (
                <div
                  className="flex flex-col gap-4"
                  aria-busy={pending || undefined}
                >
                  <div className="flex flex-wrap gap-3">
                    <div className="min-w-[16rem] flex-1">
                      <Field>
                        <Input
                          type="search"
                          name="q"
                          aria-label={t("searchLabel")}
                          placeholder={t("searchPlaceholder")}
                          leading={<Icon name="search" size="sm" />}
                          value={search}
                          autoComplete="off"
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-10 gap-y-4">
                    <ChoiceChips
                      legend={t("listingLegend")}
                      legendVisible
                      options={LISTING_CHIPS.map((v) => ({
                        value: v,
                        label: t(`listing.${v}`),
                      }))}
                      value={filters.listing}
                      onChange={(next) =>
                        change({
                          listing: (next ?? "ALL") as KoskListingFilter,
                        })
                      }
                    />
                  </div>
                  {directory === null ? (
                    <Alert tone="error" title={t("loadFailedTitle")}>
                      <p>{t("loadFailed")}</p>
                      <Button variant="outline" size="small" onClick={refresh}>
                        {t("retry")}
                      </Button>
                    </Alert>
                  ) : (
                    <>
                      <Table
                        caption={t("caption")}
                        columns={columns}
                        rows={rows}
                        rowKey={(k) => k.id}
                        empty={emptyText}
                        responsive="stack"
                      />
                      {pages > 1 ? (
                        <nav
                          aria-label={t("pagerLabel")}
                          className="flex items-center justify-center gap-3"
                          data-testid="pager"
                        >
                          <Button
                            variant="outline"
                            size="small"
                            disabled={filters.page <= 1}
                            onClick={() =>
                              go({ ...filters, page: filters.page - 1 })
                            }
                          >
                            {t("previous")}
                          </Button>
                          <span className="mds-caption">
                            {t("pageOf", {
                              page: filters.page,
                              total: pages,
                            })}
                          </span>
                          <Button
                            variant="outline"
                            size="small"
                            disabled={filters.page >= pages}
                            onClick={() =>
                              go({ ...filters, page: filters.page + 1 })
                            }
                          >
                            {t("next")}
                          </Button>
                        </nav>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </TabsPanel>
          ))}
        </Tabs>
        <p className="mds-caption">{t("footnote")}</p>
      </section>

      {chief ? (
        <OpenKoskDialog
          open={opening}
          onOpenChange={setOpening}
          onOpened={refresh}
        />
      ) : null}
    </div>
  );
}
