"use client";

import type {
  AppealListResponse,
  AppealResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { RejectDialog } from "~/features/deck-review/components/reject-dialog";
import { shortDateTime } from "~/features/deck-review/present";
import { redirectIfUnauthenticated } from "~/lib/unauthenticated";
import type { RequestTab } from "../../platform-admin/present";
import { acceptAppeal, loadAppeals, rejectAppeal } from "../actions";
import { appealFailureKey, appealSettled, appealVariant } from "../present";

interface Props {
  /** the waiting appeals and both counts; null when the first read failed */
  initial: AppealListResponse | null;
}

/**
 * İtirazlar (nizam): a medrese's appeal against a köşk refusing its course
 * request, waiting and decided. The detail shows the medrese, the course,
 * the köşk, the köşk's reason and the medrese's. "Kabul et" sends the request
 * back to the köşk; "Reddet" asks for a decision note the medrese will read.
 * Same layout as Köşk başvuruları: a list beside the selected one.
 */
export function AppealsView({ initial }: Props) {
  const t = useTranslations("nizam.AppealsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const fmt = { locale, timeZone };

  const [tab, setTab] = useState<RequestTab>("PENDING");
  const [lists, setLists] = useState<
    Partial<Record<RequestTab, AppealResponse[]>>
  >({ PENDING: initial?.items });
  const [counts, setCounts] = useState({
    pending: initial?.pendingCount ?? 0,
    decided: initial?.decidedCount ?? 0,
  });
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial?.items[0]?.id ?? null
  );
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const items = lists[tab] ?? [];
  const selected = items.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(
    async (next: RequestTab) => {
      setLoading(true);
      let result: Awaited<ReturnType<typeof loadAppeals>> | null;
      try {
        result = await loadAppeals(next);
      } catch {
        result = null;
      }
      setLoading(false);
      if (redirectIfUnauthenticated(result)) return;
      if (!result?.success) {
        setFailed(true);
        toast.error(t("loadFailedTitle"), {
          description: t("loadFailed"),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }
      setFailed(false);
      setLists((current) => ({ ...current, [next]: result.data.items }));
      setCounts({
        pending: result.data.pendingCount,
        decided: result.data.decidedCount,
      });
      setSelectedId(result.data.items[0]?.id ?? null);
    },
    [t]
  );

  const changeTab = (next: RequestTab) => {
    setTab(next);
    setSelectedId((lists[next] ?? [])[0]?.id ?? null);
    if (lists[next] === undefined) void load(next);
  };

  /** The appeal is decided: it leaves the waiting list and the next one is selected. */
  const settle = (id: string) => {
    const rest = (lists.PENDING ?? []).filter((a) => a.id !== id);
    setLists({ PENDING: rest });
    setCounts((c) => ({
      pending: Math.max(0, c.pending - 1),
      decided: c.decided + 1,
    }));
    setSelectedId(rest[0]?.id ?? null);
  };

  const fail = (body: unknown, id: string) => {
    if (appealSettled(body)) settle(id);
    toast.error(t("answerFailed"), {
      description: t(appealFailureKey(body) as never),
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const accept = async () => {
    if (!selected || accepting) return;
    setAccepting(true);
    const result = await acceptAppeal(selected.id);
    setAccepting(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      fail(result.errorBody, selected.id);
      return;
    }
    toast.success(t("accepted"), {
      description: t("acceptedBody", { title: selected.title }),
    });
    settle(selected.id);
  };

  const reject = async (note: string): Promise<boolean> => {
    if (!selected) return false;
    const result = await rejectAppeal(selected.id, note);
    if (redirectIfUnauthenticated(result)) return false;
    if (!result.success) {
      fail(result.errorBody, selected.id);
      return appealSettled(result.errorBody);
    }
    toast.success(t("rejected"), {
      description: t("rejectedBody", { title: selected.title }),
    });
    settle(selected.id);
    return true;
  };

  const listItem = (a: AppealResponse) => {
    const active = a.id === selectedId;
    return (
      <li key={a.id}>
        <button
          type="button"
          className="flex w-full flex-col rounded-surface p-3 text-start"
          style={
            active
              ? { background: "var(--background-color-selected, #eceefc)" }
              : undefined
          }
          aria-current={active ? "true" : undefined}
          data-testid="appeal-item"
          onClick={() => setSelectedId(a.id)}
        >
          <bdi className="font-semibold">{a.title}</bdi>
          <span className="mds-caption">
            <bdi>{a.madrasah.name}</bdi> · <bdi>{a.kosk.name}</bdi>
          </span>
          <span className="mds-caption">
            {shortDateTime(a.decidedAt ?? a.createdAt, fmt)}
            {tab === "DECIDED" ? ` · ${t(`status.${a.status}` as never)}` : ""}
          </span>
        </button>
      </li>
    );
  };

  const line = (label: string, value: string, testId?: string) => (
    <div className="flex flex-col gap-1">
      <span className="mds-caption">{label}</span>
      <p className="mds-reading" data-testid={testId}>
        <bdi>{value}</bdi>
      </p>
    </div>
  );

  const detailPanel = () => {
    if (!selected) return null;
    const waiting = selected.status === "PENDING";
    return (
      <section
        aria-labelledby="appeal-title"
        className="flex min-w-0 flex-col gap-5 rounded-surface border border-neutral-subtle p-4 sm:p-6"
        data-testid="appeal-detail"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="mds-eyebrow">{t("detailEyebrow")}</span>
            <h2 id="appeal-title" className="mds-h2">
              <bdi>{selected.title}</bdi>
            </h2>
          </div>
          <Badge variant={appealVariant(selected.status)}>
            {t(`status.${selected.status}` as never)}
          </Badge>
        </header>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("madrasah")}</dt>
            <dd className="m-0">
              <bdi>{selected.madrasah.name}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("course")}</dt>
            <dd className="m-0">
              <bdi>{selected.title}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("kosk")}</dt>
            <dd className="m-0">
              <bdi>{selected.kosk.name}</bdi>
            </dd>
          </div>
        </dl>
        {line(t("rejectReason"), selected.rejectReason ?? "", "reject-reason")}
        {line(t("reason"), selected.reason, "appeal-reason")}
        {waiting ? (
          <div className="flex gap-3">
            <Button loading={accepting} onClick={() => void accept()}>
              {t("accept")}
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}>
              {t("reject")}
            </Button>
          </div>
        ) : selected.decisionNote ? (
          <Alert tone="neutral" title={t("decisionNote")}>
            <bdi>{selected.decisionNote}</bdi>
          </Alert>
        ) : null}
      </section>
    );
  };

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="appeals"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
      </header>

      {failed && lists[tab] === undefined ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load(tab)}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Tabs
            label={t("tabsLabel")}
            locale={locale}
            value={tab}
            onChange={(v) => changeTab(v as RequestTab)}
            tabs={[
              {
                value: "PENDING",
                label: t("tabs.PENDING"),
                count: counts.pending,
              },
              {
                value: "DECIDED",
                label: t("tabs.DECIDED"),
                count: counts.decided,
              },
            ]}
          />
          {loading && lists[tab] === undefined ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} height="4.5rem" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState>{t(`empty.${tab}`)}</EmptyState>
          ) : (
            <div className="grid gap-grid lg:grid-cols-[22rem_minmax(0,1fr)]">
              <ul
                className="m-0 flex min-w-0 list-none flex-col gap-1 self-start rounded-surface border border-neutral-subtle p-2"
                data-testid="appeal-list"
              >
                {items.map(listItem)}
              </ul>
              {detailPanel()}
            </div>
          )}
        </div>
      )}

      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        kind="appeal"
        subject={selected?.title ?? null}
        onSubmit={reject}
      />
    </div>
  );
}
