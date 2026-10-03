"use client";

import type {
  NotificationCountsResponse,
  NotificationResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { SystemState } from "@medaris/ui/mds/system-state";
import { Tabs } from "@medaris/ui/mds/tabs";
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
  replaceList,
  rollBack,
  type TabKey,
} from "../notification-state";
import {
  groupByDay,
  TYPE_FILTERS,
  type TypeFilter,
  typesOf,
} from "../notification-view";
import { NotificationRow } from "./notification-row";

export interface NotificationsPageProps {
  /** null when the server could not read them: the page offers a retry */
  initial: {
    items: NotificationResponse[];
    nextCursor: string | null;
    counts: NotificationCountsResponse;
  } | null;
  /** "koşk" or the Medaris-wide wording of the description */
  scope: "kosk" | "platform";
  /** the server's clock, so the day groups agree between server and browser render */
  now: string;
}

const EMPTY_COUNTS = { unread: 0, total: 0 };

/**
 * Bildirimler (design nizam/37 for the köşk nazımı, nizam/46 for Medaris
 * administration): the caller's notifications in day groups, "Tümü" and
 * "Okunmamış" tabs with counts, the "Bildirim türü" chips and "Tümünü okundu
 * say". Reads are optimistic and roll back with a toast when the API refuses.
 */
export function NotificationsPage({
  initial,
  scope,
  now,
}: NotificationsPageProps) {
  const t = useTranslations("nizam.NotificationsPage");
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
  const [filter, setFilter] = useState<TypeFilter>("all");
  // `loading` while the list for the chosen tab and chip is on its way
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<"first" | "list" | "more" | null>(
    initial ? null : "first"
  );
  const [pending, startTransition] = useTransition();
  // The latest state for rollbacks, which run after an `await`.
  const latest = useRef(state);
  latest.current = state;
  // Ignores a list answer that arrives after the person chose something else:
  // a first page, a next page, or the refusal of a read made on the old list.
  const generation = useRef(0);

  const fetchList = useCallback((nextTab: TabKey, nextFilter: TypeFilter) => {
    const mine = ++generation.current;
    setLoading(true);
    setFailed(null);
    void loadNotifications(nextTab, typesOf(nextFilter)).then((res) => {
      if (mine !== generation.current) return;
      setLoading(false);
      if (!res.success) {
        setFailed("list");
        return;
      }
      setState((s) =>
        s ? replaceList(s, res.data.items, res.data.nextCursor) : s
      );
    });
  }, []);

  const loadMore = (cursor: string) =>
    startTransition(async () => {
      const mine = generation.current;
      const res = await loadNotifications(tab, typesOf(filter), cursor);
      // another tab or chip was chosen meanwhile: this page belongs to the old list
      if (mine !== generation.current) return;
      if (!res.success) {
        setFailed("more");
        return;
      }
      setFailed(null);
      setState((s) =>
        s ? appendPage(s, res.data.items, res.data.nextCursor) : s
      );
    });

  const retryFirst = () =>
    startTransition(async () => {
      const [list, counts] = await Promise.all([
        loadNotifications("all", typesOf("all")),
        loadNotificationCounts(),
      ]);
      if (!list.success || !counts.success) return;
      setFailed(null);
      setTab("all");
      setFilter("all");
      setState(
        initialState(list.data.items, list.data.nextCursor, counts.data)
      );
      router.refresh();
    });

  const read = (n: NotificationResponse) => {
    const before = latest.current;
    if (!before) return;
    const mine = generation.current;
    setState((s) => (s ? markRead(s, tab, n.id, new Date()) : s));
    void markNotificationRead(n.id).then((res) => {
      if (res.success) {
        // the shell's badge and the bell read the count on the server
        router.refresh();
        return;
      }
      setState((s) =>
        s ? rollBack(s, before, mine === generation.current) : s
      );
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
    const mine = generation.current;
    setState((s) => (s ? markAllRead(s, tab, new Date()) : s));
    void markAllNotificationsRead().then((res) => {
      if (res.success) {
        router.refresh();
        return;
      }
      setState((s) =>
        s ? rollBack(s, before, mine === generation.current) : s
      );
      toaster.notify({
        tone: "error",
        title: t("markAllFailedTitle"),
        description: t("markAllFailedText"),
      });
    });
  };

  const changeTab = (value: string) => {
    const next: TabKey = value === "unread" ? "unread" : "all";
    if (next === tab) return;
    setTab(next);
    if (state) fetchList(next, filter);
  };

  const changeFilter = (value: string | null) => {
    const next = (TYPE_FILTERS as readonly string[]).includes(value ?? "")
      ? (value as TypeFilter)
      : "all";
    // pressing the chosen chip again unpresses it, which reads as "Tümü"
    if (next === filter) return;
    setFilter(next);
    if (state) fetchList(tab, next);
  };

  const counts = state?.counts ?? EMPTY_COUNTS;

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
    if (loading) return <ListSkeleton />;
    if (failed === "list") {
      return (
        <SystemState
          shell
          headingLevel={2}
          title={t("errorTitle")}
          action={
            <Button variant="outline" onClick={() => fetchList(tab, filter)}>
              {t("retry")}
            </Button>
          }
        >
          {t("errorText")}
        </SystemState>
      );
    }
    if (state.items.length === 0) {
      return (
        <EmptyState icon={<Icon name="bell" size="lg" />}>
          {tab === "unread" ? t("emptyUnreadTitle") : t("emptyTitle")}
        </EmptyState>
      );
    }
    const groups = groupByDay(state.items, now, timeZone);
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
        {state.nextCursor ? (
          <div>
            <Button
              variant="outline"
              loading={pending}
              loadingLabel={t("loadingMore")}
              onClick={() => state.nextCursor && loadMore(state.nextCursor)}
            >
              {t("loadMore")}
            </Button>
            {failed === "more" ? (
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
    <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body-sm max-inline-measure">
            {t(scope === "kosk" ? "subtitleKosk" : "subtitlePlatform")}
          </p>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        />
        <ChoiceChips
          legend={t("typeLegend")}
          value={filter}
          onChange={(value) => changeFilter(value)}
          options={TYPE_FILTERS.map((key) => ({
            value: key,
            label: t(`filters.${key}`),
          }))}
        />
      </div>
      <div
        role="tabpanel"
        aria-label={tab === "unread" ? t("tabUnread") : t("tabAll")}
        aria-live="polite"
        aria-busy={loading}
      >
        {body()}
      </div>
    </div>
  );
}

const ListSkeleton = () => (
  <div className="flex flex-col gap-3" aria-busy="true">
    <Skeleton width="6rem" height="12px" />
    <Skeleton height="96px" />
    <Skeleton height="96px" />
  </div>
);
