"use client";

import type { InactiveScopeResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatDay } from "../../permissions/present";
import { recordScopeView } from "../actions";
import {
  contentPath,
  daysPassive,
  filterByType,
  inactiveErrorKey,
  type Messages,
  reasonKey,
  TYPE_FILTERS,
  type TypeFilter,
} from "../present";
import { AssignScopeDialog } from "./assign-scope-dialog";

interface Props {
  /** null when the first read failed */
  scopes: InactiveScopeResponse[] | null;
}

/**
 * Pasif kapsamlar (nizam 14): the köşks, medreses and courses whose last
 * manager is gone, with why, since when and who it was, a filter by kind, and
 * the two things to do with one: give it a manager again ("… ata"), or open
 * its content ("İçeriği gör"), which is written to the audit log every time.
 * A medrese has no page in Nizam to open, so its row has no such button.
 */
export function InactiveView({ scopes }: Props) {
  const tm = useTranslations("nizam.InactivePage");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [filter, setFilter] = useState<TypeFilter>("ALL");
  const [assigning, setAssigning] = useState<InactiveScopeResponse | null>(
    null
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  // Read on the client after mounting, so server and browser agree while hydrating.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const refresh = () => startTransition(() => router.refresh());
  const rows = useMemo(
    () => filterByType(scopes ?? [], filter),
    [scopes, filter]
  );

  const view = async (row: InactiveScopeResponse) => {
    const path = contentPath(row);
    if (!path) return;
    setBusyId(row.id);
    const result = await recordScopeView(row.type, row.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(t("viewFailed"), {
        description: t(inactiveErrorKey(result.errorBody)),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    router.push(`/${locale}${path}`);
  };

  const columns: TableColumn<InactiveScopeResponse>[] = [
    {
      key: "scope",
      header: t("columns.scope"),
      rowHeader: true,
      width: "24%",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={r.name} entity decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{r.name}</bdi>
            <bdi className="mds-caption">
              {r.kosk
                ? t("kindInKosk", {
                    kind: t(`kinds.${r.type}`),
                    kosk: r.kosk.name,
                  })
                : t(`kinds.${r.type}`)}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      key: "reason",
      header: t("columns.reason"),
      width: "24%",
      render: (r) => (
        <span className="flex flex-col">
          <span>{t(`reasons.${reasonKey(r)}`)}</span>
          {r.removedBy ? (
            <span className="mds-caption" data-testid="removed-by">
              {r.removedByRole
                ? t("removedByRole", {
                    name: r.removedBy.name ?? t("unknownPerson"),
                    role: t(`removers.${r.removedByRole}`),
                  })
                : (r.removedBy.name ?? t("unknownPerson"))}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "since",
      header: t("columns.since"),
      width: "14%",
      render: (r) => (
        <span className="flex flex-col">
          <span>{formatDay(r.since, locale, timeZone)}</span>
          <span className="mds-caption" data-testid="days-passive">
            {t("daysPassive", {
              count: daysPassive(r.since, now ?? new Date(), timeZone),
            })}
          </span>
        </span>
      ),
    },
    {
      key: "last",
      header: t("columns.last"),
      width: "20%",
      render: (r) => (
        <span className="flex flex-col">
          <bdi>{r.lastManager?.name ?? t("unknownPerson")}</bdi>
          <span className="flex flex-wrap items-center gap-2">
            <span className="mds-caption">{t(`lastRoles.${r.lastRole}`)}</span>
            {r.wasImam ? <Badge variant="secondary">{t("imam")}</Badge> : null}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "18%",
      render: (r) => (
        <span className="flex flex-nowrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            aria-label={t("assignLabel", {
              action: t(`assign.${r.type}`),
              name: r.name,
            })}
            onClick={() => setAssigning(r)}
          >
            {t(`assign.${r.type}`)}
          </Button>
          {contentPath(r) ? (
            <Button
              variant="ghost"
              size="small"
              loading={busyId === r.id}
              aria-label={t("viewLabel", { name: r.name })}
              onClick={() => void view(r)}
            >
              {t("view")}
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="inactive"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>

      <Alert tone="neutral" title={t("noticeTitle")}>
        <p>{t("noticeBody")}</p>
      </Alert>

      <section
        aria-labelledby="inactive-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="inactive-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {scopes ? (
            <span className="mds-caption" data-testid="inactive-count">
              {t("count", { count: rows.length })}
            </span>
          ) : null}
        </div>
        <ChoiceChips
          legend={t("filterLegend")}
          value={filter}
          onChange={(v) => setFilter((v ?? "ALL") as TypeFilter)}
          options={TYPE_FILTERS.map((value) => ({
            value,
            label: t(`filters.${value}`),
          }))}
        />
        {scopes === null ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button variant="outline" size="small" onClick={refresh}>
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <Table
            caption={t("caption")}
            columns={columns}
            rows={rows}
            rowKey={(r) => `${r.type}:${r.id}`}
            empty={t("empty")}
            responsive="stack"
          />
        )}
      </section>

      <AssignScopeDialog
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
