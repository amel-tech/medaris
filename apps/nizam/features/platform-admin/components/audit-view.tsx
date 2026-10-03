"use client";

import type {
  AuditEntryResponse,
  AuditPageResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { loadAuditPage } from "../actions";
import {
  AUDIT_RANGES,
  AUDIT_SCOPE_OPTIONS,
  AUDIT_TYPE_OPTIONS,
  type AuditFilters,
  type AuditRange,
  auditDetail,
  auditExportHref,
  auditFiltersToQuery,
  auditTime,
  recordNumber,
  shortName,
} from "../present";

const ALL = "ALL";

interface Props {
  filters: AuditFilters;
  /** the first page of these filters; null when that read failed */
  initial: AuditPageResponse | null;
}

/**
 * Denetim kaydı (nizam 17): who read or changed what, newest first. The
 * filters live in the URL (the server page reads them again on every change,
 * so a link carries the view); "Daha eskileri göster" follows the cursor with
 * the same filters. The rows are read-only. "Dışa aktar" downloads the same
 * filters as CSV, and tedrisat writes that export into the log too.
 */
export function AuditView({ filters, initial }: Props) {
  const t = useTranslations("nizam.AuditPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const pathname = usePathname();

  const [items, setItems] = useState<AuditEntryResponse[]>(
    initial?.items ?? []
  );
  const [cursor, setCursor] = useState<string | null>(
    initial?.nextCursor ?? null
  );
  const failed = initial === null;
  // `initial` is a fresh read after a filter change or "Tekrar dene"
  // (router.refresh): the rows seeded from the first render must follow it.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial?.items ?? []);
    setCursor(initial?.nextCursor ?? null);
  }
  const [more, setMore] = useState(false);
  const [actor, setActor] = useState(filters.actor ?? "");
  const now = useRef(new Date());

  const apply = (next: AuditFilters) => {
    const query = auditFiltersToQuery(next);
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const change = (patch: Partial<AuditFilters>) =>
    apply({ ...filters, ...patch });

  // The person search waits for the typing to pause before it asks again.
  useEffect(() => {
    if (actor.trim() === (filters.actor ?? "")) return;
    const timer = setTimeout(
      () => apply({ ...filters, actor: actor.trim() || undefined }),
      400
    );
    return () => clearTimeout(timer);
  }, [actor]);

  const older = async () => {
    if (!cursor) return;
    setMore(true);
    const result = await loadAuditPage(filters, cursor);
    setMore(false);
    if (!result.success) {
      toast.error(t("moreFailedTitle"), {
        description: t("moreFailed"),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    setItems((current) => [...current, ...result.data.items]);
    setCursor(result.data.nextCursor ?? null);
  };

  const when = (at: Date | string) => {
    const { day, date, time } = auditTime(at, now.current, {
      locale,
      timeZone,
    });
    return `${day ? t(`day.${day}`) : date} ${time}`;
  };

  const columns: TableColumn<AuditEntryResponse>[] = [
    {
      key: "record",
      header: t("columns.record"),
      width: "10rem",
      render: (e) => (
        <span className="flex flex-col">
          <span className="font-semibold" data-testid="record-number">
            {recordNumber(e.number)}
          </span>
          <span className="mds-caption">{when(e.createdAt)}</span>
        </span>
      ),
    },
    {
      key: "actor",
      header: t("columns.actor"),
      render: (e) => (
        <span className="flex items-center gap-3">
          <Avatar name={shortName(e.actor.name)} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi>{e.actor.name ?? t("unknownPerson")}</bdi>
            {e.actor.role ? (
              <span className="mds-caption">
                {t(`roles.${e.actor.role}` as never)}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "action",
      header: t("columns.action"),
      render: (e) => {
        const detail = auditDetail(e.details);
        return (
          <span className="flex flex-col">
            <span className="font-semibold">
              {t(`types.${e.type}` as never)}
            </span>
            {detail ? (
              <span className="mds-caption">
                <bdi>{detail}</bdi>
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "scope",
      header: t("columns.scope"),
      render: (e) => (
        <span className="flex flex-col">
          <bdi>{e.scope.name ?? t("scopes.PLATFORM")}</bdi>
          <span className="mds-caption">
            {t(`scopeKinds.${e.scope.kind}` as never)}
          </span>
        </span>
      ),
    },
  ];

  const range: AuditRange | typeof ALL = filters.range ?? ALL;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="audit-log"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="max-w-[48rem]">{t("intro")}</p>
        </div>
        <a
          className="mds-btn mds-btn--large mds-btn--outline"
          href={auditExportHref(filters)}
          download
          data-testid="audit-export"
        >
          {t("export")}
        </a>
      </header>

      <Alert tone="neutral" title={t("noticeTitle")}>
        {t("notice")}
      </Alert>

      <form
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        aria-label={t("filtersLabel")}
        onSubmit={(e) => {
          e.preventDefault();
          change({ actor: actor.trim() || undefined });
        }}
      >
        <Field label={t("filters.actor")}>
          <Input
            name="actor"
            type="search"
            value={actor}
            placeholder={t("filters.actorPlaceholder")}
            onChange={(e) => setActor(e.target.value)}
          />
        </Field>
        <Field label={t("filters.type")}>
          <Select
            name="type"
            options={[
              { value: ALL, label: t("filters.allTypes") },
              ...AUDIT_TYPE_OPTIONS.map((type) => ({
                value: type,
                label: t(`types.${type}` as never),
              })),
            ]}
            value={filters.type ?? ALL}
            onChange={(v) =>
              change({
                type: v && v !== ALL ? (v as AuditFilters["type"]) : undefined,
              })
            }
          />
        </Field>
        <Field label={t("filters.scope")}>
          <Select
            name="scope"
            options={[
              { value: ALL, label: t("filters.allScopes") },
              ...AUDIT_SCOPE_OPTIONS.map((scope) => ({
                value: scope,
                label: t(`scopes.${scope}` as never),
              })),
            ]}
            value={filters.scope ?? ALL}
            onChange={(v) =>
              change({
                scope:
                  v && v !== ALL ? (v as AuditFilters["scope"]) : undefined,
              })
            }
          />
        </Field>
        <Field label={t("filters.range")}>
          <Select
            name="range"
            options={[
              { value: ALL, label: t("ranges.ALL") },
              ...AUDIT_RANGES.map((r) => ({
                value: r,
                label: t(`ranges.${r}` as never),
              })),
            ]}
            value={range}
            onChange={(v) =>
              change({
                range: v && v !== ALL ? (v as AuditRange) : undefined,
                from: undefined,
                to: undefined,
              })
            }
          />
        </Field>
        {filters.range === "custom" ? (
          <>
            <Field label={t("filters.from")}>
              <Input
                name="from"
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => change({ from: e.target.value || undefined })}
              />
            </Field>
            <Field label={t("filters.to")}>
              <Input
                name="to"
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => change({ to: e.target.value || undefined })}
              />
            </Field>
          </>
        ) : null}
      </form>

      {failed ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button
            variant="outline"
            size="small"
            onClick={() => router.refresh()}
          >
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <>
          <Table
            caption={t("title")}
            columns={columns}
            rows={items}
            rowKey={(e) => e.id}
            responsive="stack"
            empty={<EmptyState>{t("empty")}</EmptyState>}
          />
          <div className="flex flex-col items-start gap-3">
            {cursor ? (
              <Button
                variant="outline"
                loading={more}
                onClick={() => void older()}
                data-testid="audit-older"
              >
                {t("older")}
              </Button>
            ) : null}
            <p className="mds-caption" data-testid="audit-retention">
              {t("retention")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
