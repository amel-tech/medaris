"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { restoreItem } from "../actions";
import { type ArchiveRow, archiveErrorKey } from "../archive";

export interface ArchiveTabView {
  id: string;
  label: string;
  count: number;
  href: string;
}

export interface ArchivePager {
  range: string;
  previousHref: string | null;
  nextHref: string | null;
}

/**
 * The tabs, the table of "Gizlenen öğeler" and its pager (nazir 12). The rows
 * arrive worded and dated. "Geri al" brings an item back at once, with no
 * question (the design draws none) and a toast; a refusal is worded from the
 * API's code and the list is read again where the answer means it has moved.
 * Where the caller's kademe is below the one that hid an item, the sentence
 * that says so stands in the button's place.
 */
export function ArchiveList({
  tabs,
  active,
  rows,
  empty,
  pager,
}: {
  tabs: ArchiveTabView[];
  active: string;
  rows: ArchiveRow[];
  /** the sentence for a tab with nothing hidden */
  empty: string;
  pager: ArchivePager | null;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const restore = (row: ArchiveRow) => {
    setBusy(row.key);
    startTransition(async () => {
      const result = await restoreItem(row.type, row.id);
      if (result.success) {
        notify({
          tone: "success",
          title: t("Archive.restored"),
          description: t("Archive.restoredBody", { title: result.data.title }),
        });
        router.refresh();
      } else {
        notify({
          tone: "error",
          title: t("Archive.restoreFailedTitle"),
          description: words(archiveErrorKey(result.code)),
        });
        if (result.code !== "ARCHIVE_PARENT_HIDDEN") router.refresh();
      }
      setBusy(null);
    });
  };

  const columns: TableColumn<ArchiveRow>[] = [
    {
      key: "item",
      header: t("Archive.columns.item"),
      rowHeader: true,
      width: "34%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          {row.cover ? (
            <CoverPattern seed={row.cover} size="xs" label="" />
          ) : null}
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-semibold">{row.title}</bdi>
            {row.context ? (
              <span className="mds-caption">
                <bdi>{row.context}</bdi>
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "type",
      header: t("Archive.columns.type"),
      width: "12%",
      render: (row) => (
        <Badge
          variant="secondary"
          icon={<Icon name={row.typeIcon} size="sm" />}
        >
          {row.typeLabel}
        </Badge>
      ),
    },
    {
      key: "hider",
      header: t("Archive.columns.hider"),
      width: "20%",
      render: (row) =>
        row.hider ? (
          <span className="flex flex-col">
            <bdi>{row.hider.name}</bdi>
            {row.hider.role ? (
              <span className="mds-caption">{row.hider.role}</span>
            ) : null}
          </span>
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "at",
      header: t("Archive.columns.at"),
      width: "14%",
      render: (row) => <time dateTime={row.when.iso}>{row.when.label}</time>,
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Archive.columns.actions")}
        </span>
      ),
      align: "right",
      width: "20%",
      render: (row) =>
        row.restore.kind === "button" ? (
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="undo" size="sm" />}
            loading={busy === row.key}
            aria-label={t("Archive.restoreLabel", { title: row.title })}
            onClick={() => restore(row)}
          >
            {t("Archive.restore")}
          </Button>
        ) : (
          <span className="mds-caption" data-testid="restore-note">
            {row.restore.text}
          </span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        mode="links"
        label={t("Archive.tabsLabel")}
        locale={locale}
        value={active}
        tabs={tabs.map((tab) => ({
          value: tab.id,
          label: tab.label,
          count: tab.count,
          href: tab.href,
        }))}
      />
      <div data-testid="archive">
        <Table
          caption={t("Archive.caption")}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.key}
          empty={empty}
          responsive="stack"
          sort={{ key: "at", direction: "descending" }}
        />
      </div>
      {pager ? (
        <nav
          aria-label={t("Archive.pager.label")}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span className="mds-caption">{pager.range}</span>
          <span className="flex gap-2">
            {pager.previousHref ? (
              <Button
                href={pager.previousHref}
                variant="outline"
                size="small"
                iconLeft={<Icon name="chevronLeft" size="sm" />}
              >
                {t("Archive.pager.previous")}
              </Button>
            ) : null}
            {pager.nextHref ? (
              <Button
                href={pager.nextHref}
                variant="outline"
                size="small"
                iconRight={<Icon name="chevronRight" size="sm" />}
              >
                {t("Archive.pager.next")}
              </Button>
            ) : null}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
