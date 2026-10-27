"use client";

import type { NotificationResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type MouseEvent, useRef, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../actions";
import {
  appendPage,
  markAllRead,
  markRead,
  type NotificationsState,
  notificationHref,
  replaceList,
  rowTime,
  type TabKey,
  titleKey,
  titleValues,
} from "../notifications";
import { openAddress } from "../open-address";

/**
 * Bildirimler: the "Tümü" and "Okunmamış" tabs with their counts, "Tümünü
 * okundu say", and the rows a page at a time. Opening a row marks it read and
 * goes where it leads; a read the API refuses comes back with a toast. The
 * server read the first page; the bell and the menu badge read the count on
 * the server, so a read refreshes them.
 */
export function NotificationsList({
  initial,
  tedrisUrl,
  timeZone,
}: {
  initial: NotificationsState;
  tedrisUrl: string | null;
  timeZone: string;
}) {
  const t = useTranslations("nazar.Notifications");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const toaster = useToaster();
  const [state, setState] = useState(initial);
  const [tab, setTab] = useState<TabKey>("all");
  const [list, setList] = useState<"idle" | "loading" | "failed">("idle");
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  // The latest state, for a rollback that runs after an `await`.
  const latest = useRef(state);
  latest.current = state;
  // Drops an answer that arrives after the other tab was chosen.
  const generation = useRef(0);

  const fetchTab = async (next: TabKey) => {
    const mine = ++generation.current;
    setList("loading");
    setMore("idle");
    try {
      const result = await loadNotifications(next);
      if (mine !== generation.current) return;
      if (handleUnauthenticated(result)) return;
      if (!result.success) return setList("failed");
      setState((s) =>
        replaceList(s, result.data.items, result.data.nextCursor)
      );
      setList("idle");
    } catch {
      if (mine === generation.current) setList("failed");
    }
  };

  const changeTab = (value: string) => {
    const next: TabKey = value === "unread" ? "unread" : "all";
    if (next === tab) return;
    setTab(next);
    void fetchTab(next);
  };

  const readMore = async () => {
    const cursor = state.nextCursor;
    if (!cursor) return;
    const mine = generation.current;
    setMore("loading");
    try {
      const result = await loadNotifications(tab, cursor);
      if (mine !== generation.current) return;
      if (handleUnauthenticated(result)) return;
      if (!result.success) return setMore("failed");
      setState((s) => appendPage(s, result.data.items, result.data.nextCursor));
      setMore("idle");
    } catch {
      if (mine === generation.current) setMore("failed");
    }
  };

  /** Marks a row read; true when the API took it. */
  const read = async (n: NotificationResponse): Promise<boolean> => {
    const before = latest.current;
    const mine = generation.current;
    setState((s) => markRead(s, tab, n.id, new Date()));
    let ok = false;
    try {
      const result = await markNotificationRead(n.id);
      if (handleUnauthenticated(result)) return false;
      ok = result.success;
    } catch {
      ok = false;
    }
    if (ok) {
      router.refresh();
      return true;
    }
    // On the same list the row comes back; after a tab change only the count does.
    setState((s) =>
      mine === generation.current ? before : { ...s, unread: before.unread }
    );
    toaster.notify({ tone: "error", title: t("markReadFailed") });
    return false;
  };

  const open = async (
    n: NotificationResponse,
    href: string | null,
    event: MouseEvent
  ) => {
    if (href) event.preventDefault();
    if (n.readAt === null) await read(n);
    if (href) openAddress(href);
  };

  const readAll = async () => {
    const before = latest.current;
    const mine = generation.current;
    setState((s) => markAllRead(s, tab, new Date()));
    let ok = false;
    try {
      const result = await markAllNotificationsRead();
      if (handleUnauthenticated(result)) return;
      ok = result.success;
    } catch {
      ok = false;
    }
    if (ok) return router.refresh();
    setState((s) =>
      mine === generation.current ? before : { ...s, unread: before.unread }
    );
    toaster.notify({ tone: "error", title: t("markAllFailed") });
  };

  const body = () => {
    if (list === "loading") {
      return (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton height="64px" />
          <Skeleton height="64px" />
        </div>
      );
    }
    if (list === "failed") {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="mds-error" role="alert">
            {t("loadFailed")}
          </p>
          <Button
            variant="outline"
            size="small"
            onClick={() => void fetchTab(tab)}
          >
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (state.items.length === 0) {
      return (
        <EmptyState icon={<Icon name="bell" size="lg" />}>
          {tab === "unread" ? t("emptyUnread") : t("empty")}
        </EmptyState>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="mds-card pbs-1 pbe-1">
          <ul aria-label={t("listLabel")} className="m-0 list-none p-0">
            {state.items.map((n) => (
              <NotificationRow
                key={n.id}
                notification={n}
                title={words(titleKey(n.type), titleValues(n))}
                time={rowTime(n.createdAt, locale, timeZone)}
                newLabel={t("new")}
                href={notificationHref(n, tedrisUrl)}
                onOpen={open}
              />
            ))}
          </ul>
        </div>
        {state.nextCursor ? (
          <div className="flex flex-col items-start gap-2">
            {more === "failed" ? (
              <p className="mds-error" role="alert">
                {t("loadMoreFailed")}
              </p>
            ) : null}
            <Button
              variant="outline"
              size="small"
              loading={more === "loading"}
              loadingLabel={t("loadingMore")}
              onClick={() => void readMore()}
            >
              {t("loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Tabs
          label={t("tabsLabel")}
          value={tab}
          onChange={changeTab}
          locale={locale}
          tabs={[
            { value: "all", label: t("tabAll"), count: state.total },
            { value: "unread", label: t("tabUnread"), count: state.unread },
          ]}
        />
        {state.total > 0 ? (
          <Button
            variant="secondary"
            iconLeft={<Icon name="done" />}
            disabled={state.unread === 0}
            onClick={() => void readAll()}
          >
            {t("markAllRead")}
          </Button>
        ) : null}
      </div>
      <div
        role="tabpanel"
        aria-label={tab === "unread" ? t("tabUnread") : t("tabAll")}
        aria-live="polite"
        aria-busy={list === "loading"}
      >
        {body()}
      </div>
    </div>
  );
}

const ROW =
  "flex w-full items-center gap-3 px-4 py-3 text-start no-underline text-inherit";

/** One notification: its title, when it came, and "Yeni" while unread. */
function NotificationRow({
  notification: n,
  title,
  time,
  newLabel,
  href,
  onOpen,
}: {
  notification: NotificationResponse;
  title: string;
  time: string;
  newLabel: string;
  href: string | null;
  onOpen: (
    n: NotificationResponse,
    href: string | null,
    event: MouseEvent
  ) => Promise<void>;
}) {
  const unread = n.readAt === null;
  const content = (
    <>
      <span className="flex min-inline-0 flex-1 flex-col gap-1">
        <span className={unread ? "mds-body-sm font-semibold" : "mds-body-sm"}>
          {title}
        </span>
        <time className="mds-caption" dateTime={n.createdAt.toISOString()}>
          {time}
        </time>
      </span>
      {unread ? <Badge variant="info">{newLabel}</Badge> : null}
    </>
  );
  return (
    <li
      className="[&:not(:first-child)]:border-bs border-neutral-subtle"
      data-testid="notification-row"
      data-unread={unread || undefined}
    >
      {href ? (
        <a
          className={ROW}
          href={href}
          onClick={(event) => void onOpen(n, href, event)}
        >
          {content}
        </a>
      ) : unread ? (
        <button
          type="button"
          className={`${ROW} cursor-pointer border-0 bg-transparent`}
          onClick={(event) => void onOpen(n, null, event)}
        >
          {content}
        </button>
      ) : (
        <div className={ROW}>{content}</div>
      )}
    </li>
  );
}
