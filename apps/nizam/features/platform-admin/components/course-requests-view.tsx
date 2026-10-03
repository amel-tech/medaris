"use client";

import type {
  CourseRequestListResponse,
  CourseRequestResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { RejectDialog } from "~/features/deck-review/components/reject-dialog";
import { longDateTime, shortDateTime } from "~/features/deck-review/present";
import { loadCourseRequests, rejectCourseRequest } from "../actions";
import {
  failureKey,
  isSettled,
  newCourseHref,
  type RequestTab,
} from "../present";

interface Props {
  koskId: string;
  /** the waiting requests and both counts; null when the first read failed */
  initial: CourseRequestListResponse | null;
}

/**
 * Ders talepleri (nizam 39): the courses medreses ask a köşk to open, waiting
 * and answered. "Kabul et" opens the course form with the request's name (the
 * request is accepted when that course exists, in the form); "Reddet" asks for
 * the reason the başmüderris will read.
 */
export function CourseRequestsView({ koskId, initial }: Props) {
  const t = useTranslations("nizam.CourseRequestsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const fmt = { locale, timeZone };

  const [tab, setTab] = useState<RequestTab>("PENDING");
  const [lists, setLists] = useState<
    Partial<Record<RequestTab, CourseRequestResponse[]>>
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
  const [rejecting, setRejecting] = useState(false);

  const items = lists[tab] ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? null;

  const load = useCallback(
    async (next: RequestTab) => {
      setLoading(true);
      let result: Awaited<ReturnType<typeof loadCourseRequests>> | null;
      try {
        result = await loadCourseRequests(koskId, next);
      } catch {
        result = null;
      }
      setLoading(false);
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
    [koskId, t]
  );

  const changeTab = (next: RequestTab) => {
    setTab(next);
    setSelectedId((lists[next] ?? [])[0]?.id ?? null);
    if (lists[next] === undefined) void load(next);
  };

  /** The request is answered: it leaves the waiting list and the next one is selected. */
  const settle = (id: string) => {
    const rest = (lists.PENDING ?? []).filter((r) => r.id !== id);
    setLists({ PENDING: rest });
    setCounts((c) => ({
      pending: Math.max(0, c.pending - 1),
      decided: c.decided + 1,
    }));
    setSelectedId(rest[0]?.id ?? null);
  };

  const reject = async (reason: string): Promise<boolean> => {
    if (!selected) return false;
    const result = await rejectCourseRequest(selected.id, reason);
    if (!result.success) {
      if (isSettled(result.errorBody)) settle(selected.id);
      toast.error(t("answerFailed"), {
        description: t(failureKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return isSettled(result.errorBody);
    }
    toast.success(t("rejected"), {
      description: t("rejectedBody", { title: selected.title }),
    });
    settle(selected.id);
    return true;
  };

  const person = (r: CourseRequestResponse) =>
    r.requestedBy.name ?? t("unknownPerson");

  const listItem = (r: CourseRequestResponse) => {
    const active = r.id === selectedId;
    return (
      <li key={r.id}>
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-surface p-3 text-start"
          style={
            active
              ? { background: "var(--background-color-selected, #eceefc)" }
              : undefined
          }
          aria-current={active ? "true" : undefined}
          data-testid="course-request-item"
          onClick={() => setSelectedId(r.id)}
        >
          <Avatar name={r.madrasah.name} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{r.title}</bdi>
            <span className="mds-caption">
              <bdi>{r.madrasah.name}</bdi> · <bdi>{person(r)}</bdi>
            </span>
            <span className="mds-caption">
              {shortDateTime(r.decidedAt ?? r.createdAt, fmt)}
              {tab === "DECIDED"
                ? ` · ${t(`outcome.${r.status}` as never)}`
                : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const detail = () => {
    if (!selected) return null;
    const waiting = selected.status === "PENDING";
    return (
      <section
        aria-labelledby="course-request-title"
        className="flex flex-col gap-5 rounded-surface border border-neutral-subtle p-6"
        data-testid="course-request-detail"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="mds-eyebrow">{t("detailEyebrow")}</span>
            <h2 id="course-request-title" className="mds-h2">
              <bdi>{selected.title}</bdi>
            </h2>
          </div>
          <Badge
            variant={
              waiting
                ? "warning"
                : selected.status === "ACCEPTED"
                  ? "success"
                  : "error"
            }
          >
            {t(`status.${selected.status}` as never)}
          </Badge>
        </header>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("kosk")}</dt>
            <dd className="m-0">
              <bdi>{selected.kosk.name}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("madrasah")}</dt>
            <dd className="m-0">
              <bdi>{selected.madrasah.name}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("sentAt")}</dt>
            <dd className="m-0">{longDateTime(selected.createdAt, fmt)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("sender")}</dt>
            <dd className="m-0 flex items-center gap-2">
              <Avatar name={person(selected)} decorative />
              <bdi>{person(selected)}</bdi>
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1">
          <span className="mds-caption">{t("reason")}</span>
          <p className="mds-reading">
            <bdi>{selected.reason}</bdi>
          </p>
        </div>
        {waiting ? (
          <>
            <hr className="border-neutral-subtle" />
            <p className="mds-caption max-w-[40rem]">{t("answerNote")}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => router.push(newCourseHref(koskId, selected.id))}
              >
                {t("accept")}
              </Button>
              <Button variant="outline" onClick={() => setRejecting(true)}>
                {t("reject")}
              </Button>
            </div>
          </>
        ) : selected.status === "REJECTED" && selected.rejectReason ? (
          <Alert tone="neutral" title={t("rejectReasonTitle")}>
            <bdi>{selected.rejectReason}</bdi>
          </Alert>
        ) : null}
      </section>
    );
  };

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="course-requests"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
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
            <div className="grid gap-grid lg:grid-cols-[22rem_1fr]">
              <ul
                className="m-0 flex list-none flex-col gap-1 self-start rounded-surface border border-neutral-subtle p-2"
                data-testid="course-request-list"
              >
                {items.map(listItem)}
              </ul>
              {detail()}
            </div>
          )}
        </div>
      )}

      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        kind="courseRequest"
        subject={selected?.title ?? null}
        onSubmit={reject}
      />
    </div>
  );
}
