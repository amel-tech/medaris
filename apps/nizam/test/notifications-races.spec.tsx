// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type {
  NotificationResponse,
  PaginatedNotificationResponse,
} from "@medaris/services/tedrisat";
import { createTranslator } from "next-intl";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rollBack } from "~/features/notifications/notification-state";

/**
 * The page's answers that come late (MDRS-179): a next page asked for on one
 * tab, a read the API refused after another tab was chosen. The page is
 * mounted in happy-dom and its server actions are held open by hand, so each
 * test decides the order the answers arrive in.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next-intl", async (importOriginal) => {
  const real = await importOriginal<typeof import("next-intl")>();
  return {
    ...real,
    useLocale: () => "tr",
    useTimeZone: () => "Europe/Istanbul",
    useTranslations: (namespace: string) =>
      createTranslator({
        locale: "tr",
        messages: resources.tr.nizam,
        namespace: namespace.split(".").slice(1).join(".") as never,
      }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
const toast = vi.hoisted(() => ({ notify: vi.fn(() => "") }));
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: toast.notify, dismiss: () => {} }),
}));
const actions = vi.hoisted(() => ({
  loadNotifications: vi.fn(),
  loadNotificationCounts: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));
vi.mock("~/features/notifications/actions", () => actions);

const NOW = "2026-10-02T12:00:00Z";

/** A row with no target, so its title is not a link; `who` tells rows apart in the markup. */
const row = (id: string, who: string, read = false): NotificationResponse => ({
  id,
  type: "COURSE_BAN_PLACED",
  targetType: "KOSK",
  targetId: null,
  params: { talebeName: who, actorName: "Ayşe", courseTitle: "Ders" },
  readAt: read ? new Date("2026-10-02T10:00:00Z") : null,
  createdAt: new Date("2026-10-02T09:00:00Z"),
});

const page = (
  items: NotificationResponse[],
  nextCursor: string | null
): PaginatedNotificationResponse => ({ items, nextCursor }) as never;

/** A server action answer the test releases when it chooses. */
const deferred = <T,>() => {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
};
type Answer<T> = { success: true; data: T } | { success: false };

let root: Root | null = null;
let host: HTMLElement | null = null;

const mount = async (initial: {
  items: NotificationResponse[];
  nextCursor: string | null;
  counts: { unread: number; total: number };
}) => {
  const { NotificationsPage } = await import(
    "~/features/notifications/components/notifications-page"
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      createElement(NotificationsPage, { initial, scope: "kosk", now: NOW })
    );
  });
};

beforeEach(() => {
  for (const mock of [toast.notify, ...Object.values(actions)]) {
    mock.mockReset();
  }
  toast.notify.mockReturnValue("");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
};
const byText = (selector: string, text: string) =>
  [...document.querySelectorAll(selector)].find((el) =>
    el.textContent?.includes(text)
  );
const tab = (name: string) => byText('[role="tab"]', name);
const loadMoreButton = () => byText("button", "Daha fazla göster");
const markReadButton = (who: string) =>
  [...document.querySelectorAll('[data-testid="notification-row"]')]
    .find((li) => li.textContent?.includes(who))
    ?.querySelector("button");
const shown = () =>
  [...document.querySelectorAll('[data-testid="notification-row"]')].map(
    (li) => li.textContent ?? ""
  );
const tabCount = (name: string) =>
  tab(name)?.querySelector(".mds-tab__count")?.textContent;

describe("a next page that comes back after another tab was chosen", () => {
  it("is dropped: the new list keeps its own rows and its own cursor", async () => {
    await mount({
      items: [row("1", "Birinci", true)],
      nextCursor: "old",
      counts: { unread: 1, total: 2 },
    });
    const more = deferred<Answer<PaginatedNotificationResponse>>();
    const unreadList = deferred<Answer<PaginatedNotificationResponse>>();
    actions.loadNotifications
      .mockReturnValueOnce(more.promise)
      .mockReturnValueOnce(unreadList.promise);

    await click(loadMoreButton());
    expect(actions.loadNotifications).toHaveBeenLastCalledWith(
      "all",
      expect.any(Array),
      "old"
    );
    await click(tab("Okunmamış"));
    expect(actions.loadNotifications).toHaveBeenLastCalledWith(
      "unread",
      expect.any(Array)
    );

    // the Okunmamış list is on the screen first, then the old tab's page limps in
    await act(async () =>
      unreadList.settle({
        success: true,
        data: page([row("2", "Ikinci")], null),
      })
    );
    await act(async () =>
      more.settle({
        success: true,
        data: page([row("3", "Okunmus uc", true)], "stale"),
      })
    );

    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toContain("Ikinci");
    expect(document.body.textContent).not.toContain("Okunmus uc");
    // the new list ends: the old cursor must not bring "Daha fazla göster" back
    expect(loadMoreButton()).toBeUndefined();
  });

  it("does not show its failure on the new list either", async () => {
    await mount({
      items: [row("1", "Birinci", true)],
      nextCursor: "old",
      counts: { unread: 1, total: 2 },
    });
    const more = deferred<Answer<PaginatedNotificationResponse>>();
    const unreadList = deferred<Answer<PaginatedNotificationResponse>>();
    actions.loadNotifications
      .mockReturnValueOnce(more.promise)
      .mockReturnValueOnce(unreadList.promise);

    await click(loadMoreButton());
    await click(tab("Okunmamış"));
    await act(async () =>
      unreadList.settle({
        success: true,
        data: page([row("2", "Ikinci")], "next"),
      })
    );
    await act(async () => more.settle({ success: false }));

    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(loadMoreButton()).toBeTruthy();
  });

  it("is appended when nothing else was chosen meanwhile", async () => {
    await mount({
      items: [row("1", "Birinci")],
      nextCursor: "c1",
      counts: { unread: 2, total: 2 },
    });
    actions.loadNotifications.mockResolvedValueOnce({
      success: true,
      data: page([row("2", "Ikinci")], null),
    });
    await click(loadMoreButton());
    expect(shown()).toHaveLength(2);
    expect(loadMoreButton()).toBeUndefined();
  });
});

describe("a read the API refuses after another tab was chosen", () => {
  const mountWithOneUnread = () =>
    mount({
      items: [row("1", "Birinci"), row("2", "Ikinci", true)],
      nextCursor: null,
      counts: { unread: 1, total: 2 },
    });

  it("leaves the list the server just sent and puts the unread count back", async () => {
    await mountWithOneUnread();
    const read = deferred<Answer<NotificationResponse>>();
    actions.markNotificationRead.mockReturnValueOnce(read.promise);
    actions.loadNotifications.mockResolvedValueOnce({
      success: true,
      data: page([row("1", "Birinci")], null),
    });

    await click(markReadButton("Birinci"));
    // optimistic: the one unread is read already
    expect(tabCount("Okunmamış")).toBe("0");
    await click(tab("Okunmamış"));
    expect(shown()).toHaveLength(1);

    await act(async () => read.settle({ success: false }));

    expect(toast.notify).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" })
    );
    // the Okunmamış list is still the server's, not the Tümü list from before
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toContain("Birinci");
    expect(tabCount("Okunmamış")).toBe("1");
    expect(tabCount("Tümü")).toBe("2");
  });

  it("does the same for 'Tümünü okundu say'", async () => {
    await mountWithOneUnread();
    const readAll = deferred<Answer<{ updated: number }>>();
    actions.markAllNotificationsRead.mockReturnValueOnce(readAll.promise);
    actions.loadNotifications.mockResolvedValueOnce({
      success: true,
      data: page([row("1", "Birinci")], null),
    });

    await click(byText("button", "Tümünü okundu say"));
    expect(tabCount("Okunmamış")).toBe("0");
    await click(tab("Okunmamış"));
    await act(async () => readAll.settle({ success: false }));

    expect(shown()).toHaveLength(1);
    expect(shown()[0]).toContain("Birinci");
    expect(tabCount("Okunmamış")).toBe("1");
  });

  it("still restores the whole list when the same tab is on the screen", async () => {
    await mountWithOneUnread();
    const read = deferred<Answer<NotificationResponse>>();
    actions.markNotificationRead.mockReturnValueOnce(read.promise);

    await click(markReadButton("Birinci"));
    expect(tabCount("Okunmamış")).toBe("0");
    await act(async () => read.settle({ success: false }));

    expect(tabCount("Okunmamış")).toBe("1");
    expect(markReadButton("Birinci")).toBeTruthy();
    expect(actions.loadNotifications).not.toHaveBeenCalled();
  });
});

describe("rollBack", () => {
  const before = {
    items: [row("1", "A")],
    nextCursor: "b",
    counts: { unread: 3, total: 9 },
  };
  const current = {
    items: [row("9", "Z")],
    nextCursor: null,
    counts: { unread: 2, total: 9 },
  };

  it("restores the whole state on the same list", () => {
    expect(rollBack(current, before, true)).toBe(before);
  });

  it("keeps another list's rows and cursor and restores only the counts", () => {
    expect(rollBack(current, before, false)).toEqual({
      items: current.items,
      nextCursor: null,
      counts: before.counts,
    });
  });
});
