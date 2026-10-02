"use client";

import type {
  ArchiveImpactResponse,
  ArchiveItemResponse,
  ArchiveItemType,
  ArchiveScopesResponse,
  PaginatedArchiveResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon, type IconName } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteArchiveItem,
  loadArchive,
  loadArchiveImpact,
  restoreArchiveItem,
} from "../actions";
import {
  actionName,
  archiverLine,
  contextParts,
  hasMore,
  hiddenAtLabel,
  impactLines,
  type Messages,
  PLATFORM_TYPE_FILTERS,
  type ScopeValue,
  scopeQuery,
  sessionWhen,
  shownLabel,
  TYPE_FILTERS,
} from "../present";

const TYPE_ICONS: Record<string, IconName> = {
  kosk: "kosk",
  madrasah: "medrese",
  course: "courses",
  week: "book",
  session: "calendar",
  recording: "video",
  deck: "cards",
};

type Mode =
  | { kind: "kosk"; koskId: string; koskName: string }
  | { kind: "platform" };

interface Props {
  mode: Mode;
  /** null when the first read failed */
  initial: PaginatedArchiveResponse | null;
  scopes?: ArchiveScopesResponse | null;
  pageSize: number;
}

const SEARCH_DELAY_MS = 300;

const errorCode = (body: unknown): string | null =>
  body && typeof body === "object" && "code" in body
    ? String((body as { code: unknown }).code)
    : null;

/**
 * The archive (nizam 28 for a köşk, 29 for the platform): what was hidden, with
 * who hid it and when. "Geri al" brings an item back to where it was; on the
 * platform page the başnazım can also delete it for good, after a dialog that
 * counts what goes with it.
 */
export function ArchiveView({ mode, initial, scopes, pageSize }: Props) {
  const tm = useTranslations("nizam.ArchivePage");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const platform = mode.kind === "platform";

  const [items, setItems] = useState<ArchiveItemResponse[]>(
    initial?.items ?? []
  );
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<string>("all");
  const [scope, setScope] = useState<ScopeValue>("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [target, setTarget] = useState<ArchiveItemResponse | null>(null);
  const [impact, setImpact] = useState<
    ArchiveImpactResponse | "loading" | "failed" | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const request = useRef(0);
  const first = useRef(true);

  const filters = useMemo(
    () => ({
      type: type === "all" ? undefined : (type as ArchiveItemType),
      q: query.trim(),
      ...scopeQuery(scope),
    }),
    [type, query, scope]
  );

  const fetchPage = useCallback(
    async (nextPage: number, append: boolean) => {
      const ticket = ++request.current;
      setLoading(true);
      const result = await loadArchive({
        koskScope: mode.kind === "kosk" ? mode.koskId : undefined,
        ...filters,
        page: nextPage,
        limit: pageSize,
      });
      // A newer request (the next keystroke) supersedes this one.
      if (ticket !== request.current) return;
      setLoading(false);
      if (!result.success) {
        setFailed(true);
        toast.error(t("loadFailedTitle"), {
          description: t("loadFailed"),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }
      setFailed(false);
      setTotal(result.data.total);
      setPage(result.data.page);
      setItems((current) =>
        append ? [...current, ...result.data.items] : result.data.items
      );
    },
    [filters, mode, pageSize, t]
  );

  // A filter or a search changes the list from page one; the search waits for a pause in typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const wait = setTimeout(() => void fetchPage(1, false), SEARCH_DELAY_MS);
    return () => clearTimeout(wait);
  }, [fetchPage]);

  const when = (at: Date) => sessionWhen(at, { locale, timeZone });
  const now = new Date();

  const restore = async (item: ArchiveItemResponse) => {
    setBusyId(item.id);
    const result = await restoreArchiveItem(
      item.type as ArchiveItemType,
      item.id
    );
    setBusyId(null);
    if (result.success) {
      setItems((current) => current.filter((i) => i.id !== item.id));
      setTotal((n) => Math.max(0, n - 1));
      toast.success(t("restored"), {
        description: t("restoredBody", { title: item.title }),
      });
      return;
    }
    const code = errorCode(result.errorBody);
    if (code === "ARCHIVE_ITEM_NOT_FOUND") {
      setItems((current) => current.filter((i) => i.id !== item.id));
      setTotal((n) => Math.max(0, n - 1));
    }
    toast.error(t("restoreFailed"), {
      description:
        code === "ARCHIVE_PARENT_HIDDEN"
          ? t("restoreParentHidden")
          : code === "ARCHIVE_ITEM_NOT_FOUND"
            ? t("restoreGone")
            : result.error,
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const askDelete = async (item: ArchiveItemResponse) => {
    setTarget(item);
    setImpact("loading");
    const result = await loadArchiveImpact(
      item.type as ArchiveItemType,
      item.id
    );
    setImpact(result.success ? result.data : "failed");
  };

  const closeDialog = () => {
    setTarget(null);
    setImpact(null);
  };

  const confirmDelete = async () => {
    if (!target) return;
    setDeleting(true);
    const result = await deleteArchiveItem(
      target.type as ArchiveItemType,
      target.id
    );
    setDeleting(false);
    const gone =
      !result.success &&
      errorCode(result.errorBody) === "ARCHIVE_ITEM_NOT_FOUND";
    if (result.success || gone) {
      setItems((current) => current.filter((i) => i.id !== target.id));
      setTotal((n) => Math.max(0, n - 1));
      if (result.success) {
        toast.success(t("deleted"), {
          description: t("deletedBody", { title: target.title }),
        });
      } else {
        toast.error(t("deleteFailed"), {
          description: t("deleteGone"),
          duration: Number.POSITIVE_INFINITY,
        });
      }
      closeDialog();
      return;
    }
    toast.error(t("deleteFailed"), {
      description: result.error,
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const typeOptions = [
    { value: "all", label: t("typeFilter", { value: t("all") }) },
    ...(platform ? PLATFORM_TYPE_FILTERS : TYPE_FILTERS).map((x) => ({
      value: x,
      label: t(`types.${x}`),
    })),
  ];
  const scopeOptions = [
    { value: "all", label: t("scopeFilter", { value: t("all") }) },
    ...(scopes?.kosks ?? []).map((k) => ({
      value: `kosk:${k.id}`,
      label: k.name,
    })),
    ...(scopes?.madrasahs ?? []).map((m) => ({
      value: `madrasah:${m.id}`,
      label: m.name,
    })),
  ];

  const hiddenCell = (item: ArchiveItemResponse) => {
    const context = contextParts(item, t, when);
    const line = platform ? [t(`types.${item.type}`), ...context] : context;
    return (
      <span className="flex items-center gap-3">
        <CoverPattern seed={item.courseId ?? item.id} size="xs" label="" />
        <span className="flex min-w-0 flex-col">
          <bdi className="font-semibold">{item.title}</bdi>
          {line.length > 0 ? (
            <span className="mds-caption">{line.join(" · ")}</span>
          ) : null}
        </span>
      </span>
    );
  };

  const columns: TableColumn<ArchiveItemResponse>[] = [
    {
      key: "hidden",
      header: t("columns.hidden"),
      rowHeader: true,
      render: hiddenCell,
    },
    platform
      ? {
          key: "scope",
          header: t("columns.scope"),
          render: (item) => (
            <span className="flex flex-col">
              {item.koskName ? <bdi>{item.koskName}</bdi> : null}
              {item.madrasahName ? (
                <bdi className="mds-caption">{item.madrasahName}</bdi>
              ) : null}
            </span>
          ),
        }
      : {
          key: "type",
          header: t("columns.type"),
          render: (item) => (
            <Badge
              variant="ghost"
              icon={
                <Icon name={TYPE_ICONS[item.type] ?? "archive"} size="sm" />
              }
            >
              {t(`types.${item.type}`)}
            </Badge>
          ),
        },
    {
      key: "hiddenBy",
      header: t("columns.hiddenBy"),
      render: (item) => {
        const who = archiverLine(item, t);
        return (
          <span className="flex flex-col">
            <bdi>{who.name}</bdi>
            {who.role ? <span className="mds-caption">{who.role}</span> : null}
          </span>
        );
      },
    },
    {
      key: "hiddenAt",
      header: t("columns.hiddenAt"),
      render: (item) =>
        hiddenAtLabel(new Date(item.archivedAt), now, { locale, timeZone, t }),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      render: (item) => {
        const context = contextParts(item, t, when);
        return (
          <span className="flex flex-col items-end gap-1">
            <Button
              variant="outline"
              size="small"
              iconLeft={<Icon name="undo" size="sm" />}
              loading={busyId === item.id}
              aria-label={actionName("restoreLabel", item, t, context)}
              onClick={() => void restore(item)}
            >
              {t("restore")}
            </Button>
            {platform ? (
              <Button
                variant="link"
                size="small"
                aria-label={actionName(
                  "permanentDeleteLabel",
                  item,
                  t,
                  context
                )}
                onClick={() => void askDelete(item)}
              >
                {t("permanentDelete")}
              </Button>
            ) : null}
          </span>
        );
      },
    },
  ];

  const caption =
    mode.kind === "kosk"
      ? t("koskCaption", { kosk: mode.koskName })
      : t("platformCaption");
  const empty =
    filters.q || filters.type || scope !== "all"
      ? t("emptyFiltered")
      : t("empty");
  const lines =
    impact && impact !== "loading" && impact !== "failed"
      ? impactLines(impact, t)
      : [];

  return (
    <div className="flex flex-col gap-section" data-testid="archive">
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">
          {mode.kind === "kosk" ? t("koskIntro") : t("platformIntro")}
        </p>
      </header>

      <section
        aria-labelledby="archive-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="archive-heading" className="mds-visually-hidden">
          {t("heading")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[16rem] grow md:max-w-[26rem]">
            <Field>
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                leading={<Icon name="search" size="sm" />}
              />
            </Field>
          </div>
          {platform ? (
            <Select
              options={scopeOptions}
              value={scope}
              onChange={(v) => setScope((v ?? "all") as ScopeValue)}
              aria-label={t("scopeFilterLabel")}
            />
          ) : null}
          <Select
            options={typeOptions}
            value={type}
            onChange={(v) => setType(v ?? "all")}
            aria-label={t("typeFilterLabel")}
          />
          <p
            className="ms-auto mds-caption"
            aria-live="polite"
            data-testid="archive-count"
          >
            {t("count", { count: total })}
          </p>
        </div>

        {failed ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button
              variant="outline"
              size="small"
              onClick={() => void fetchPage(1, false)}
            >
              {t("retry")}
            </Button>
          </Alert>
        ) : loading && items.length === 0 ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <span className="mds-visually-hidden">{t("loading")}</span>
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} height="3rem" />
            ))}
          </div>
        ) : (
          <Table
            caption={caption}
            columns={columns}
            rows={items}
            rowKey={(item) => `${item.type}:${item.id}`}
            empty={empty}
            responsive="stack"
          />
        )}

        {!failed && platform && items.length > 0 ? (
          <div className="flex items-center justify-between gap-3">
            <p className="mds-caption" data-testid="archive-shown">
              {shownLabel(items.length, total, t)}
            </p>
            {hasMore(items.length, total) ? (
              <Button
                variant="secondary"
                loading={loading}
                onClick={() => void fetchPage(page + 1, true)}
              >
                {t("loadMore")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {mode.kind === "kosk" ? (
          <p className="mds-caption">{t("footer")}</p>
        ) : null}
      </section>

      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) closeDialog();
        }}
        eyebrow={target?.koskName ?? undefined}
        title={target ? t(`dialog.titles.${target.type}`) : ""}
        confirmLabel={t("dialog.confirm")}
        cancelLabel={t("dialog.cancel")}
        closeLabel={t("dialog.close")}
        confirmVariant="destructive"
        confirmDisabled={impact === "loading"}
        confirmLoading={deleting}
        onConfirm={() => void confirmDelete()}
      >
        {target ? (
          <>
            <p>
              {tm.rich("dialog.body", {
                title: target.title,
                b: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            {impact === "loading" ? (
              <p className="mds-caption">{t("dialog.loadingImpact")}</p>
            ) : impact === "failed" ? (
              <Alert tone="warning">{t("dialog.impactFailed")}</Alert>
            ) : (
              <ul data-testid="impact-lines">
                {lines.map((line) => (
                  <li key={line.key} className="border-be py-3 last:border-0">
                    {line.text}
                  </li>
                ))}
              </ul>
            )}
            <p>{t("dialog.audit")}</p>
          </>
        ) : null}
      </AlertDialog>
    </div>
  );
}
