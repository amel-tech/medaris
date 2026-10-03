"use client";

import type {
  NotificationCountsResponse,
  NotificationResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { SystemState } from "@medaris/ui/mds/system-state";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  loadNotificationCounts,
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../actions";
import {
  appendPage,
  initialState,
  markAllRead,
  markRead,
  type NotificationsState,
  type TabKey,
} from "../notification-state";
import { groupByDay } from "../notification-view";
import { NotificationAside } from "./notification-aside";
import { NotificationRow } from "./notification-row";

export interface NotificationsPageProps {
  /** null when the server could not read them: the page offers a retry */
  initial: {
    items: NotificationResponse[];
    nextCursor: string | null;
    counts: NotificationCountsResponse;
  } | null;
  /** the server's clock, so the day groups agree between server and browser render */
  now: string;
}

const EMPTY_COUNTS = { unread: 0, total: 0 };

/**
 * Bildirimler (design tedris/36): the caller's notifications in day groups,
 * "Tümü" and "Okunmamış" tabs with counts, "Tümünü okundu say", and the
 * "Neler bildirilir" card. Reads are optimistic and roll back with a toast
 * when the API refuses (spec "Okundu işaretleme hatası").
 */
export function NotificationsPage({ initial, now }: NotificationsPageProps) {
  const t = useTranslations("tedris.NotificationsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const toaster = useToaster();

  const [state, setState] = useState<NotificationsState | null>(
    initial
      ? initialState(initial.items, initial.nextCursor, initial.counts)
      : null
  );
  const [tab, setTab] = useState<TabKey>("all");
  const [failed, setFailed] = useState<TabKey | "first" | null>(
    initial ? null : "first"
  );
  const [pending, startTransition] = useTransition();
  // The latest state for rollbacks, which run after an `await`.
  const latest = useRef(state);
  latest.current = state;

  const update = useCallback(
    (next: (s: NotificationsState) => NotificationsState) =>
      setState((s) => (s ? next(s) : s)),
    []
  );

  const fetchPage = useCallback(
    (target: TabKey, cursor?: string) =>
      startTransition(async () => {
        const res = await loadNotifications(target, cursor);
        if (!res.success) {
          setFailed(target);
          return;
        }
        setFailed(null);
        setState((s) =>
          s ? appendPage(s, target, res.data.items, res.data.nextCursor) : s
        );
      }),
    []
  );

  const retryFirst = () =>
    startTransition(async () => {
      const [list, counts] = await Promise.all([
        loadNotifications("all"),
        loadNotificationCounts(),
      ]);
      if (!list.success || !counts.success) return;
      setFailed(null);
      setState(
        initialState(list.data.items, list.data.nextCursor, counts.data)
      );
      router.refresh();
    });

  const read = (n: NotificationResponse) => {
    const before = latest.current;
    if (!before) return;
    update((s) => markRead(s, n.id, new Date()));
    void markNotificationRead(n.id).then((res) => {
      if (res.success) {
        router.refresh();
        return;
      }
      setState(before);
      toaster.notify({
        tone: "error",
        title: t("markReadFailedTitle"),
        description: t("markReadFailedText"),
      });
    });
  };

  const readAll = () => {
    const before = latest.current;
    if (!before) return;
    update((s) => markAllRead(s, new Date()));
    void markAllNotificationsRead().then((res) => {
      if (res.success) {
        router.refresh();
        return;
      }
      setState(before);
      toaster.notify({
        tone: "error",
        title: t("markAllFailedTitle"),
        description: t("markAllFailedText"),
      });
    });
  };

  const changeTab = (value: string) => {
    const next: TabKey = value === "unread" ? "unread" : "all";
    setTab(next);
    setFailed(null);
    if (state && !state[next].loaded) fetchPage(next);
  };

  const counts = state?.counts ?? EMPTY_COUNTS;
  const current = state?.[tab];

  const body = () => {
    if (!state || failed === "first") {
      return (
        <SystemState
          shell
          headingLevel={2}
          title={t("errorTitle")}
          action={
            <Button variant="outline" onClick={retryFirst} loading={pending}>
              {t("retry")}
            </Button>
          }
        >
          {t("errorText")}
        </SystemState>
      );
    }
    if (!current?.loaded) {
      return failed === tab ? (
        <SystemState
          shell
          headingLevel={2}
          title={t("errorTitle")}
          action={
            <Button variant="outline" onClick={() => fetchPage(tab)}>
              {t("retry")}
            </Button>
          }
        >
          {t("errorText")}
        </SystemState>
      ) : (
        <ListSkeleton />
      );
    }
    if (current.items.length === 0) {
      return (
        <EmptyState icon={<Icon name="bell" size="lg" />}>
          {tab === "unread" ? t("emptyUnreadTitle") : t("emptyTitle")}
        </EmptyState>
      );
    }
    const groups = groupByDay(current.items, now, timeZone);
    return (
      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <section
            key={group.key}
            className="flex flex-col gap-3"
            aria-labelledby={`notification-group-${group.key}`}
          >
            <h2 className="mds-eyebrow" id={`notification-group-${group.key}`}>
              {t(
                group.key === "today"
                  ? "groupToday"
                  : group.key === "yesterday"
                    ? "groupYesterday"
                    : "groupEarlier"
              )}
            </h2>
            <div className="mds-card pbs-1 pbe-1">
              <ul aria-label={t("listLabel")}>
                {group.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    group={group.key}
                    onRead={read}
                  />
                ))}
              </ul>
            </div>
          </section>
        ))}
        {current.nextCursor ? (
          <div>
            <Button
              variant="outline"
              loading={pending}
              loadingLabel={t("loadingMore")}
              onClick={() =>
                current.nextCursor && fetchPage(tab, current.nextCursor)
              }
            >
              {t("loadMore")}
            </Button>
            {failed === tab ? (
              <p className="mds-error" role="alert">
                {t("errorText")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body-sm">{t("subtitle")}</p>
        </div>
        {state && counts.total > 0 ? (
          <Button
            variant="secondary"
            iconLeft={<Icon name="done" />}
            disabled={counts.unread === 0}
            onClick={readAll}
          >
            {t("markAllRead")}
          </Button>
        ) : null}
      </div>
      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex flex-col gap-6">
          <Tabs
            label={t("tabsLabel")}
            value={tab}
            onChange={changeTab}
            locale={locale}
            tabs={[
              {
                value: "all",
                label: t("tabAll"),
                count: state ? counts.total : undefined,
              },
              {
                value: "unread",
                label: t("tabUnread"),
                count: state ? counts.unread : undefined,
              },
            ]}
          >
            <TabsPanel value="all" className="pbs-8">
              {tab === "all" ? body() : null}
            </TabsPanel>
            <TabsPanel value="unread" className="pbs-8">
              {tab === "unread" ? body() : null}
            </TabsPanel>
          </Tabs>
        </div>
        <NotificationAside />
      </div>
    </main>
  );
}

const ListSkeleton = () => (
  <div className="flex flex-col gap-3" aria-busy="true">
    <Skeleton width="6rem" height="12px" />
    <Skeleton height="96px" />
    <Skeleton height="96px" />
  </div>
);
