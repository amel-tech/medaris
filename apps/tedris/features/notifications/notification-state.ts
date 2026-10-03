import type {
  NotificationCountsResponse,
  NotificationResponse,
} from "@medaris/services/tedrisat";

/**
 * The page's list state as pure transitions, so the optimistic updates and
 * their rollbacks can be tested without a browser. Two lists are kept — the
 * "Tümü" tab and the "Okunmamış" tab — and one pair of counts; every
 * transition keeps all three consistent.
 */

export type TabKey = "all" | "unread";

export interface TabState {
  items: NotificationResponse[];
  nextCursor: string | null;
  /** false until the first page of this tab arrived (the unread tab loads on first visit) */
  loaded: boolean;
}

export interface NotificationsState {
  all: TabState;
  unread: TabState;
  counts: NotificationCountsResponse;
}

export const initialState = (
  items: NotificationResponse[],
  nextCursor: string | null,
  counts: NotificationCountsResponse
): NotificationsState => ({
  all: { items, nextCursor, loaded: true },
  unread: { items: [], nextCursor: null, loaded: false },
  counts,
});

/** Appends a page, leaving out rows the tab already holds (a row can move between pages while the list is open). */
export const appendPage = (
  state: NotificationsState,
  tab: TabKey,
  items: NotificationResponse[],
  nextCursor: string | null
): NotificationsState => {
  const known = new Set(state[tab].items.map((n) => n.id));
  return {
    ...state,
    [tab]: {
      items: [...state[tab].items, ...items.filter((n) => !known.has(n.id))],
      nextCursor,
      loaded: true,
    },
  };
};

/** Marks one row read in both lists and lowers the unread count — once, however often it is called. */
export const markRead = (
  state: NotificationsState,
  id: string,
  at: Date
): NotificationsState => {
  const row = state.all.items.find((n) => n.id === id);
  const wasUnread =
    row !== undefined
      ? row.readAt === null
      : state.unread.items.some((n) => n.id === id);
  if (!wasUnread) return state;
  return {
    all: {
      ...state.all,
      items: state.all.items.map((n) =>
        n.id === id ? { ...n, readAt: at } : n
      ),
    },
    unread: {
      ...state.unread,
      items: state.unread.items.filter((n) => n.id !== id),
    },
    counts: { ...state.counts, unread: Math.max(state.counts.unread - 1, 0) },
  };
};

export const markAllRead = (
  state: NotificationsState,
  at: Date
): NotificationsState => ({
  all: {
    ...state.all,
    items: state.all.items.map((n) =>
      n.readAt === null ? { ...n, readAt: at } : n
    ),
  },
  unread: { items: [], nextCursor: null, loaded: true },
  counts: { ...state.counts, unread: 0 },
});
