"use client";

import type {
  MadrasahDirectoryItemResponse,
  MadrasahDirectoryResponse,
  MadrasahStatusFilter,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { hideLevelOf } from "../../archive/hide-level";
import { PassivateScopeDialog } from "../../passivation/components/passivate-scope-dialog";
import { restoreMadrasah } from "../actions";
import {
  ALL_MADRASAH_ABILITIES,
  dateWithCase,
  directoryPath,
  hostingLabel,
  type MadrasahAbilities,
  type Messages,
  madrasahErrorKey,
  STATUS_LOOK,
  STATUS_TABS,
  sinceLabel,
  termEndedLabel,
} from "../present";
import { AssignHeadDialog, type AssignTarget } from "./assign-head-dialog";
import { OpenMadrasahDialog } from "./open-madrasah-dialog";

interface Props {
  /** null when the first read failed */
  directory: MadrasahDirectoryResponse | null;
  status: MadrasahStatusFilter;
  q: string;
  /** The buttons the viewer may use (MDRS-108); all of them when omitted. */
  can?: MadrasahAbilities;
}

const SEARCH_DELAY_MS = 300;

/**
 * Medreseler (nizam 07): every medrese on the platform with its başmüderris,
 * courses and hosting köşks, a warning for the passive ones, the status tabs
 * with their counts (`?durum=`) and a search (`?q=`). The URL is the one
 * source of the filter: a tab or a search navigates, the server reads again,
 * so the counts and the rows always come from the same answer. "Geri al"
 * brings a hidden medrese back, to whoever hid it or a level above (the row's
 * `canRestore`); "Başmüderris ata" opens the appointment of a passive one;
 * "Pasife al" shows what taking a medrese out of service takes along and asks
 * to confirm it (MDRS-227); "Medrese aç" is nizam/08. Each is drawn only for a
 * viewer whose permissions open it (`can`), so none leads to a 403 (MDRS-108).
 */
export function MadrasahsView({
  directory,
  status,
  q,
  can = ALL_MADRASAH_ABILITIES,
}: Props) {
  const tm = useTranslations("nizam.MadrasahsPage");
  const t = tm as unknown as Messages;
  const tl = useTranslations("nizam.HideLevel");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);
  const [opening, setOpening] = useState(false);
  const [assigning, setAssigning] = useState<AssignTarget | null>(null);
  const [passivating, setPassivating] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const searched = useRef(q);

  // The search follows the URL when it is changed from outside (back button).
  useEffect(() => {
    setSearch(q);
    searched.current = q;
  }, [q]);

  // Typing navigates after a pause, so a name is one request, not one per key.
  useEffect(() => {
    if (search.trim() === searched.current.trim()) return;
    const timer = setTimeout(() => {
      searched.current = search;
      startTransition(() =>
        router.replace(`/${locale}${directoryPath(status, search)}`)
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, status, router, locale]);

  const refresh = () => startTransition(() => router.refresh());

  const goTo = (next: string) =>
    startTransition(() =>
      router.push(
        `/${locale}${directoryPath(next as MadrasahStatusFilter, search)}`
      )
    );

  const restore = async (item: MadrasahDirectoryItemResponse) => {
    setBusyId(item.id);
    const result = await restoreMadrasah(item.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(t("restoreFailed"), {
        description: t(madrasahErrorKey(result.errorBody)),
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
  const countOf = (value: MadrasahStatusFilter) =>
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

  const columns: TableColumn<MadrasahDirectoryItemResponse>[] = [
    {
      key: "madrasah",
      header: t("columns.madrasah"),
      rowHeader: true,
      width: "24%",
      render: (m) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={m.name} entity decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{m.name}</bdi>
            <bdi dir="ltr" className="mds-caption font-mono">
              @{m.handle}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      key: "head",
      header: t("columns.head"),
      width: "19%",
      render: (m) =>
        m.headMuderris ? (
          <bdi>{m.headMuderris.name ?? t("unknownPerson")}</bdi>
        ) : (
          <span className="flex flex-col">
            <span className="text-neutral-muted">{t("unassigned")}</span>
            {m.status === "PASSIVE" ? (
              <span className="mds-caption">
                {termEndedLabel(m.since, dateOpts)}
              </span>
            ) : null}
          </span>
        ),
    },
    {
      key: "courses",
      header: t("columns.courses"),
      align: "right",
      width: "6%",
      render: (m) => <span className="tabular-nums">{m.courseCount}</span>,
    },
    {
      key: "hosting",
      header: t("columns.hosting"),
      width: "19%",
      render: (m) => (
        <bdi>{hostingLabel(m.hostingKosks, locale, t("noHosting"))}</bdi>
      ),
    },
    {
      key: "status",
      header: t("columns.status"),
      width: "14%",
      render: (m) => {
        const look = STATUS_LOOK[m.status];
        const since =
          m.status === "ACTIVE" ? null : sinceLabel(m.since, dateOpts);
        return (
          <span className="flex flex-col items-start gap-1">
            {look.badge ? (
              <Badge
                variant={look.badge}
                icon={
                  look.icon ? <Icon name={look.icon} size="sm" /> : undefined
                }
              >
                {t(`status.${m.status}`)}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-2">
                {look.icon ? <Icon name={look.icon} size="sm" /> : null}
                {t(`status.${m.status}`)}
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
      width: "18%",
      render: (m) =>
        m.status === "HIDDEN" ? (
          !can.restore ? null : m.canRestore ? (
            <Button
              variant="outline"
              size="small"
              iconLeft={<Icon name="undo" size="sm" />}
              loading={busyId === m.id}
              aria-label={t("restoreLabel", { name: m.name })}
              onClick={() => void restore(m)}
            >
              {t("restore")}
            </Button>
          ) : (
            // Whoever hid it, or a level above, brings it back (MDRS-143).
            <span className="mds-caption">
              {tl("locked", {
                level: tl(hideLevelOf(m.hiddenLevel, "madrasah")),
              })}
            </span>
          )
        ) : m.status === "PASSIVE" && can.assign ? (
          <Button
            variant="outline"
            size="small"
            aria-label={t("assignLabel", { name: m.name })}
            onClick={() => setAssigning({ id: m.id, name: m.name })}
          >
            {t("assign")}
          </Button>
        ) : m.status === "ACTIVE" && (can.assign || can.passivate) ? (
          <span className="flex flex-wrap justify-end gap-2">
            {m.headMuderris && can.assign ? (
              <Button
                variant="outline"
                size="small"
                aria-label={t("changeLabel", { name: m.name })}
                onClick={() =>
                  setAssigning({
                    id: m.id,
                    name: m.name,
                    headId: m.headMuderris?.id ?? null,
                    headName: m.headMuderris?.name ?? null,
                  })
                }
              >
                {t("change")}
              </Button>
            ) : null}
            {can.passivate ? (
              <Button
                variant="outline"
                size="small"
                aria-label={t("passivateLabel", { name: m.name })}
                onClick={() => setPassivating({ id: m.id, name: m.name })}
              >
                {t("passivate")}
              </Button>
            ) : null}
          </span>
        ) : null,
    },
  ];

  const rows = directory?.items ?? [];
  const passive = directory?.passive ?? [];
  const truncated = directory ? directory.total > rows.length : false;

  const emptyText =
    directory && directory.counts.all === 0
      ? t("emptyAll")
      : search.trim()
        ? t("emptySearch")
        : t("emptyStatus");

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="madrasahs"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        {can.open ? (
          <Button
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => setOpening(true)}
          >
            {t("open")}
          </Button>
        ) : null}
      </header>

      {passive.length > 0 ? (
        <Alert
          tone="warning"
          title={
            passive.length === 1
              ? t("passiveTitleOne", { name: passive[0]?.name ?? "" })
              : t("passiveTitleMany", { count: passive.length })
          }
          data-testid="passive-warning"
        >
          <p>
            {passive.length === 1 && passive[0]
              ? t("passiveBodyOne", {
                  dateLocative: dateWithCase(
                    new Date(passive[0].since),
                    "locative",
                    dateOpts
                  ),
                })
              : t("passiveBodyMany", {
                  names: hostingLabel(passive, locale, ""),
                })}
          </p>
        </Alert>
      ) : null}

      <section
        aria-labelledby="madrasahs-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="madrasahs-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {can.archive ? (
            <a className="mds-link" href={`/${locale}/arsiv`}>
              {t("archive")}
            </a>
          ) : null}
        </div>

        <Tabs
          label={t("tabsLabel")}
          locale={locale}
          value={status}
          onChange={goTo}
          tabs={STATUS_TABS.map((value) => ({
            value,
            label: t(`tabs.${value}`),
            count: countOf(value),
          }))}
        >
          {STATUS_TABS.map((value) => (
            <TabsPanel key={value} value={value} className="pbs-4">
              {value !== status ? null : (
                <div
                  className="flex flex-col gap-4"
                  aria-busy={pending || undefined}
                >
                  <div className="max-w-[28rem]">
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
                        caption={t(`caption.${status}`)}
                        columns={columns}
                        rows={rows}
                        rowKey={(m) => m.id}
                        empty={emptyText}
                        responsive="stack"
                      />
                      {truncated ? (
                        <p className="mds-caption" data-testid="truncated">
                          {t("showing", {
                            total: directory.total,
                            shown: rows.length,
                          })}
                        </p>
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

      <OpenMadrasahDialog
        open={opening}
        onOpenChange={setOpening}
        onOpened={refresh}
      />
      <PassivateScopeDialog
        kind="MADRASAH"
        id={passivating?.id ?? ""}
        name={passivating?.name ?? ""}
        open={passivating !== null}
        onOpenChange={(open) => {
          if (!open) setPassivating(null);
        }}
        onPassivated={refresh}
      />
      <AssignHeadDialog
        open={assigning !== null}
        onOpenChange={(open) => {
          if (!open) setAssigning(null);
        }}
        target={assigning}
        onAssigned={refresh}
      />
    </div>
  );
}
