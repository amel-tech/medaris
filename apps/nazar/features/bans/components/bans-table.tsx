"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ALL } from "~/features/courses/courses";
import {
  type BanRow,
  type BanStatus,
  BLANK,
  bansHref,
  type Filters,
  type ScopeOption,
} from "../bans";
import { ReasonDialog, type ReasonKind } from "./reason-dialog";

/** The three decisions of a row, in the order the design stacks them. */
const ACTIONS = [
  { kind: "lift", icon: "undo", aria: "liftLabel" },
  { kind: "escalate", icon: "ban", aria: "escalateLabel" },
  { kind: "permanent", icon: "ban", aria: "permanentLabel" },
] as const;

export interface BanTabView {
  status: BanStatus;
  count: number;
}

/**
 * The tabs, the filters and the table of "Yasaklamalar" (nazir 11). The rows
 * arrive worded and dated, so the table has nothing to translate. The tabs and
 * the scope filter live in the address (`?durum=`, `?kapsam=`): choosing one
 * asks the server for the narrowed list. "Kişi ara" narrows the rows already
 * read, by name or e-mail; the API has no search. Each action is drawn only
 * where the API says the caller may take it (absent, not disabled) and a row
 * the caller may not lift says why. The three decisions open their reason
 * dialogs from here, which is why this is a client component.
 */
export function BansTable({
  madrasahId,
  madrasahName,
  rows,
  filters,
  tabs,
  scopeOptions,
}: {
  madrasahId: string;
  madrasahName: string;
  rows: BanRow[];
  filters: Filters;
  tabs: BanTabView[];
  scopeOptions: ScopeOption[];
}) {
  const t = useTranslations("nazar");
  const locale = useLocale();
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [deciding, setDeciding] = useState<{
    kind: ReasonKind;
    row: BanRow;
  } | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const filter = (next: Filters) =>
    startTransition(() => router.replace(bansHref(madrasahId, next)));
  const active = filters.status === "ACTIVE";

  const wanted = query.trim().toLocaleLowerCase(locale);
  const shown = wanted
    ? rows.filter((row) =>
        `${row.name} ${row.email ?? ""}`
          .toLocaleLowerCase(locale)
          .includes(wanted)
      )
    : rows;
  const narrowed = wanted !== "" || filters.scope !== ALL;
  const scopeValue = scopeOptions.some(
    (option) => option.value === filters.scope
  )
    ? filters.scope
    : ALL;

  const actionButton = (
    row: BanRow,
    action: (typeof ACTIONS)[number],
    first: boolean
  ) => (
    <Button
      key={action.kind}
      variant={first ? "outline" : "ghost"}
      size="small"
      iconLeft={<Icon name={action.icon} size="sm" />}
      aria-label={t(`Bans.${action.aria}`, { name: row.name })}
      onClick={() => setDeciding({ kind: action.kind, row })}
    >
      {t(`Bans.${action.kind}`)}
    </Button>
  );

  const columns: TableColumn<BanRow>[] = [
    {
      key: "person",
      header: t("Bans.columns.person"),
      rowHeader: true,
      width: "20%",
      render: (row) => (
        <span className="flex min-inline-0 items-start gap-3">
          <Avatar name={row.name} decorative />
          <span className="flex min-inline-0 flex-col items-start gap-1">
            <bdi className="font-semibold">{row.name}</bdi>
            {row.recent ? <Badge variant="info">{t("Bans.new")}</Badge> : null}
            {row.permanentPending ? (
              <Badge variant="warning" icon={<Icon name="clock" size="sm" />}>
                {t("Bans.permanentPending")}
              </Badge>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "scope",
      header: t("Bans.columns.scope"),
      width: "15%",
      render: (row) => (
        <span className="flex flex-col">
          <span>{row.scope.label}</span>
          {row.scope.detail.map((line) => (
            <bdi key={line} className="mds-caption">
              {line}
            </bdi>
          ))}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("Bans.columns.reason"),
      width: "20%",
      render: (row) => <bdi>{row.reason}</bdi>,
    },
    {
      key: "bannedBy",
      header: t("Bans.columns.bannedBy"),
      width: "14%",
      render: (row) => (
        <span className="flex flex-col">
          <bdi>{row.bannedBy.name}</bdi>
          {row.bannedBy.role ? (
            <span className="mds-caption">{row.bannedBy.role}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "when",
      header: t("Bans.columns.when"),
      width: "11%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.when.iso}>
          {row.when.label}
        </time>
      ),
    },
    active
      ? {
          key: "actions",
          header: (
            <span className="mds-visually-hidden">
              {t("Bans.columns.actions")}
            </span>
          ),
          align: "right",
          width: "20%",
          render: (row) => {
            const offered = ACTIONS.filter(
              (action) => row.actions[action.kind]
            );
            return (
              <span className="flex flex-col items-end gap-2">
                {offered.map((action, index) =>
                  actionButton(row, action, index === 0)
                )}
                {row.actions.note ? (
                  <span
                    className="mds-caption text-end"
                    data-testid="lift-note"
                  >
                    {row.actions.note}
                  </span>
                ) : null}
              </span>
            );
          },
        }
      : {
          key: "liftedBy",
          header: t("Bans.columns.liftedBy"),
          width: "20%",
          render: (row) =>
            row.lifted ? (
              <span className="flex flex-col">
                <bdi>{row.lifted.name}</bdi>
                <time className="mds-caption" dateTime={row.lifted.when.iso}>
                  {row.lifted.when.label}
                </time>
                {row.lifted.reason ? (
                  <bdi className="mds-caption">{row.lifted.reason}</bdi>
                ) : null}
              </span>
            ) : null,
        },
  ];

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="bans"
      aria-busy={loading || undefined}
    >
      <Tabs
        mode="links"
        label={t("Bans.tabsLabel")}
        locale={locale}
        value={filters.status}
        tabs={tabs.map((tab) => ({
          value: tab.status,
          label: t(`Bans.tabs.${tab.status}`),
          count: tab.count,
          href: bansHref(madrasahId, { ...filters, status: tab.status }),
        }))}
      />
      <fieldset className="flex min-inline-0 flex-wrap items-center gap-2 border-0 p-0">
        <legend className="mds-visually-hidden">
          {t("Bans.filters.label")}
        </legend>
        <Field
          className="inline-full md:inline-[20rem]"
          label={
            <span className="mds-visually-hidden">
              {t("Bans.filters.search")}
            </span>
          }
        >
          <Input
            type="search"
            name="q"
            autoComplete="off"
            placeholder={t("Bans.filters.search")}
            leading={<Icon name="search" size="sm" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Select
          aria-label={t("Bans.filters.scope.label")}
          options={scopeOptions}
          value={scopeValue}
          onChange={(value) => filter({ ...filters, scope: value ?? ALL })}
        />
      </fieldset>
      <Table
        caption={t(`Bans.caption.${filters.status}`)}
        columns={columns}
        rows={shown}
        rowKey={(row) => row.id}
        empty={
          narrowed ? (
            <span className="flex flex-col items-center gap-2">
              {t("Bans.emptyFiltered")}
              <Button
                variant="link"
                size="small"
                onClick={() => {
                  setQuery("");
                  filter({ ...BLANK, status: filters.status });
                }}
              >
                {t("Bans.clearFilters")}
              </Button>
            </span>
          ) : (
            t(`Bans.empty.${filters.status}`)
          )
        }
        sort={active ? { key: "when", direction: "descending" } : undefined}
        responsive="stack"
      />
      {deciding ? (
        <ReasonDialog
          key={`${deciding.kind}:${deciding.row.id}`}
          kind={deciding.kind}
          row={deciding.row}
          madrasahName={madrasahName}
          onClose={() => setDeciding(null)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
