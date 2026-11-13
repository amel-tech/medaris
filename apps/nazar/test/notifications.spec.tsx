// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { NotificationResponse } from "@medaris/services/tedrisat";
import { Toaster, ToastProvider } from "@medaris/ui/mds/toast";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendPage,
  markAllRead,
  markRead,
  type NotificationsState,
  notificationHref,
  titleKey,
  WORDED_TYPES,
} from "~/features/notifications/notifications";
import { cleanup, click, render, settle } from "./dom";
import { expand, html, textOf, translatorFor } from "./server-render";

/**
 * Bildirimler of Nazar: the caller's notifications, a page at a time, with
 * the "Tümü" and "Okunmamış" tabs and "Tümünü okundu say". Opening a row
 * marks it read and goes where it leads. The reads and actions are stubs.
 */
type Answer<T> =
  | { status: "ok"; data: T }
  | { status: "forbidden" }
  | { status: "failed" };

const state = {
  read: { status: "failed" } as Answer<unknown>,
  asked: [] as unknown[],
};
const loadNotifications = vi.fn();
const markNotificationRead = vi.fn();
const markAllNotificationsRead = vi.fn();
const openAddress = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/env", () => ({ env: { TEDRIS_URL: "http://localhost:4000" } }));
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: async (_what: string, call: (api: unknown) => Promise<unknown>) => {
    await call({
      notifications: {
        listNotifications: async (request: unknown) => {
          state.asked.push(["list", request]);
        },
        getNotificationCounts: async (request: unknown) => {
          state.asked.push(["counts", request]);
        },
      },
    });
    return state.read;
  },
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => ({ id: "u-1", timeZone: "Europe/Istanbul" }),
}));
vi.mock("~/features/notifications/actions", () => ({
  loadNotifications: (status: string, cursor?: string) =>
    loadNotifications(status, cursor),
  markNotificationRead: (id: string) => markNotificationRead(id),
  markAllNotificationsRead: () => markAllNotificationsRead(),
}));
vi.mock("~/features/notifications/open-address", () => ({
  openAddress: (href: string) => openAddress(href),
}));

const COURSE = "5b6f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";
const SESSION = "6c7f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";
const KOSK = "7d8f8d7e-0c1a-4d3b-8a2e-1f9c3d4e5a6b";

const note = (
  id: string,
  over: Partial<NotificationResponse> = {}
): NotificationResponse =>
  ({
    id,
    type: "ENROLLMENT_APPROVED",
    targetType: "COURSE",
    targetId: COURSE,
    params: { courseTitle: "Bina" },
    readAt: null,
    createdAt: new Date("2026-10-03T18:00:00Z"),
    ...over,
  }) as NotificationResponse;

const ok = <T,>(data: T) => ({ success: true as const, data });
const loaded = (
  items: NotificationResponse[],
  counts = { unread: 0, total: items.length },
  nextCursor: string | null = null
) => ({
  status: "ok" as const,
  data: { first: { items, nextCursor }, counts },
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider
    locale="tr"
    timeZone="Europe/Istanbul"
    messages={{ nazar: resources.tr.nazar }}
  >
    <ToastProvider>
      {node}
      <Toaster />
    </ToastProvider>
  </NextIntlClientProvider>
);

const element = async () => {
  // The route renders this; called directly so its async body is expanded.
  const Page = (await import("../app/(global)/bildirimler/page")).default;
  return wrap(Page());
};
const markup = async () => html(await element());
const mount = async () => {
  await render((await expand(await element())) as ReactElement);
  await settle(40);
};

const tr = resources.tr.nazar.Notifications;
const rows = () => [
  ...document.querySelectorAll("[data-testid='notification-row']"),
];
const buttonNamed = (label: string) =>
  [...document.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;
const tabNamed = (label: string) =>
  [...document.querySelectorAll("[role='tab']")].find((b) =>
    b.textContent?.includes(label)
  ) as HTMLElement;

beforeEach(() => {
  state.read = loaded([]);
  state.asked = [];
  for (const fn of [
    loadNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    openAddress,
    refresh,
  ]) {
    fn.mockReset();
  }
});
afterEach(cleanup);

describe("reading the notifications", () => {
  it("asks for the first page of every type and both counts, under the title Bildirimler", async () => {
    state.read = loaded([note("a")], { unread: 1, total: 1 });
    const text = textOf(await markup());
    expect(state.asked).toEqual([
      ["list", { status: "all" }],
      ["counts", {}],
    ]);
    expect(text).toMatch(/^Bildirimler /);
    expect(text).toContain(tr.tabAll);
    expect(text).toContain(tr.tabUnread);
  });

  it("draws a row as its title, its time in the viewer's zone, and Yeni while unread", async () => {
    state.read = loaded(
      [
        note("a"),
        note("b", {
          type: "DECK_PUBLISH_RESULT",
          targetType: "DECK",
          params: { outcome: "approved" },
          readAt: new Date("2026-10-04T08:00:00Z"),
        }),
      ],
      { unread: 1, total: 2 }
    );
    await mount();
    const [first, second] = rows();
    expect(first.textContent).toContain(tr.types.ENROLLMENT_APPROVED);
    // 18:00 UTC is 21:00 in Istanbul.
    expect(first.textContent).toContain("3 Eki 2026 21:00");
    expect(first.textContent).toContain(tr.new);
    expect(second.textContent).toContain("Deste yayınlandı");
    expect(second.textContent).not.toContain(tr.new);
  });

  it("reads a type this build does not know as a plain Bildirim", async () => {
    state.read = loaded([
      note("a", { type: "SOMETHING_NEW" as NotificationResponse["type"] }),
    ]);
    await mount();
    expect(rows()[0].textContent).toContain(tr.unknownTitle);
  });

  it("says there are none with the empty state, and offers no mark-all", async () => {
    const text = textOf(await markup());
    expect(text).toContain(tr.empty);
    expect(text).not.toContain(tr.markAllRead);
  });

  it("answers a read that failed with the retry state", async () => {
    state.read = { status: "failed" };
    const text = textOf(await markup());
    expect(text).toContain(tr.loadFailedTitle);
  });
});

describe("opening a row", () => {
  it("marks it read, refreshes the bell, and goes to the Tedris page it leads to", async () => {
    state.read = loaded([note("a")], { unread: 1, total: 1 });
    markNotificationRead.mockResolvedValue(ok({}));
    await mount();
    const link = rows()[0].querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(
      `http://localhost:4000/courses/${COURSE}`
    );
    await click(link);
    await settle();
    expect(markNotificationRead).toHaveBeenCalledWith("a");
    expect(refresh).toHaveBeenCalled();
    expect(openAddress).toHaveBeenCalledWith(
      `http://localhost:4000/courses/${COURSE}`
    );
    expect(rows()[0].textContent).not.toContain(tr.new);
    expect(tabNamed(tr.tabUnread).textContent).toContain("0");
  });

  it("marks a row that leads nowhere read in place", async () => {
    state.read = loaded(
      [
        note("a", {
          type: "KOSK_BAN_PLACED",
          targetType: "KOSK",
          targetId: KOSK,
        }),
      ],
      { unread: 1, total: 1 }
    );
    markNotificationRead.mockResolvedValue(ok({}));
    await mount();
    expect(rows()[0].querySelector("a")).toBeNull();
    await click(rows()[0].querySelector("button") as Element);
    await settle();
    expect(markNotificationRead).toHaveBeenCalledWith("a");
    expect(openAddress).not.toHaveBeenCalled();
    // The title itself says "Yeni", so the marker is read off the row.
    expect(rows()[0].hasAttribute("data-unread")).toBe(false);
  });

  it("puts the row back unread and says so when the API refuses", async () => {
    state.read = loaded([note("a", { targetId: null, targetType: null })], {
      unread: 1,
      total: 1,
    });
    markNotificationRead.mockResolvedValue({ success: false, code: "X" });
    await mount();
    await click(rows()[0].querySelector("button") as Element);
    await settle();
    expect(rows()[0].textContent).toContain(tr.new);
    expect(document.body.textContent).toContain(tr.markReadFailed);
  });
});

describe("the tabs and mark-all", () => {
  it("asks for the unread page on Okunmamış", async () => {
    state.read = loaded([note("a"), note("b", { readAt: new Date() })], {
      unread: 1,
      total: 2,
    });
    loadNotifications.mockResolvedValue(
      ok({ items: [note("a")], nextCursor: null })
    );
    await mount();
    await click(tabNamed(tr.tabUnread));
    await settle();
    expect(loadNotifications).toHaveBeenCalledWith("unread", undefined);
    expect(rows()).toHaveLength(1);
  });

  it("marks every row read with Tümünü okundu say", async () => {
    state.read = loaded([note("a"), note("b")], { unread: 2, total: 2 });
    markAllNotificationsRead.mockResolvedValue(ok({ updated: 2 }));
    await mount();
    await click(buttonNamed(tr.markAllRead) as Element);
    await settle();
    expect(markAllNotificationsRead).toHaveBeenCalled();
    expect(rows().some((r) => r.textContent?.includes(tr.new))).toBe(false);
    expect(buttonNamed(tr.markAllRead)?.disabled).toBe(true);
  });
});

describe("paging", () => {
  it("asks for the next page with the cursor and appends it, until there is none", async () => {
    state.read = loaded([note("a")], { unread: 2, total: 2 }, "cursor-1");
    loadNotifications.mockResolvedValueOnce(
      ok({ items: [note("b")], nextCursor: null })
    );
    await mount();
    await click(buttonNamed(tr.loadMore) as Element);
    await settle();
    expect(loadNotifications).toHaveBeenLastCalledWith("all", "cursor-1");
    expect(rows()).toHaveLength(2);
    expect(buttonNamed(tr.loadMore)).toBeUndefined();
  });

  it("says so when the next page fails, and keeps what is shown", async () => {
    state.read = loaded([note("a")], { unread: 1, total: 2 }, "cursor-1");
    loadNotifications.mockResolvedValueOnce({ success: false, code: "X" });
    await mount();
    await click(buttonNamed(tr.loadMore) as Element);
    await settle();
    expect(document.body.textContent).toContain(tr.loadMoreFailed);
    expect(rows()).toHaveLength(1);
  });
});

describe("the page's rules", () => {
  const base: NotificationsState = {
    items: [note("a"), note("b")],
    nextCursor: "c",
    unread: 2,
    total: 2,
  };
  const at = new Date("2026-10-05T00:00:00Z");

  it("leads each target to its Tedris page, and nowhere without one", () => {
    const url = "http://localhost:4000";
    expect(notificationHref(note("a"), url)).toBe(`${url}/courses/${COURSE}`);
    expect(
      notificationHref(
        note("a", {
          targetType: "SESSION",
          targetId: SESSION,
          params: { courseId: COURSE },
        }),
        url
      )
    ).toBe(`${url}/courses/${COURSE}/lessons/${SESSION}`);
    expect(
      notificationHref(
        note("a", { targetType: "SESSION", targetId: SESSION }),
        url
      )
    ).toBeNull();
    expect(
      notificationHref(note("a", { targetType: "DECK", targetId: COURSE }), url)
    ).toBe(`${url}/decks/${COURSE}`);
    expect(
      notificationHref(
        note("a", {
          type: "COURSE_BAN_PLACED",
          targetType: "KOSK",
          targetId: KOSK,
        }),
        url
      )
    ).toBeNull();
    expect(notificationHref(note("a", { targetId: "../x" }), url)).toBeNull();
    expect(notificationHref(note("a"), null)).toBeNull();
  });

  it("words every type in all three languages", () => {
    for (const lang of ["tr", "en", "ar"] as const) {
      const types = resources[lang].nazar.Notifications.types as Record<
        string,
        string
      >;
      for (const type of WORDED_TYPES) expect(types[type], type).toBeTruthy();
    }
    expect(titleKey("ENROLLMENT_APPROVED")).toBe("types.ENROLLMENT_APPROVED");
    expect(titleKey("NOPE")).toBe("unknownTitle");
  });

  it("lowers the unread count once, and drops the row on Okunmamış", () => {
    const once = markRead(base, "all", "a", at);
    expect(markRead(once, "all", "a", at).unread).toBe(1);
    expect(markRead(base, "unread", "a", at).items.map((n) => n.id)).toEqual([
      "b",
    ]);
  });

  it("empties the Okunmamış list on mark-all, and keeps rows on Tümü", () => {
    expect(markAllRead(base, "unread", at)).toMatchObject({
      items: [],
      nextCursor: null,
      unread: 0,
    });
    expect(
      markAllRead(base, "all", at).items.every((n) => n.readAt !== null)
    ).toBe(true);
  });

  it("shows a row once when a later page reaches one already shown", () => {
    expect(
      appendPage(base, [note("b"), note("c")], null).items.map((n) => n.id)
    ).toEqual(["a", "b", "c"]);
  });
});
