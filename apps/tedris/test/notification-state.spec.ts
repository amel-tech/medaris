import type { NotificationResponse } from "@medaris/services/tedrisat";
import { describe, expect, it } from "vitest";
import {
  appendPage,
  initialState,
  markAllRead,
  markRead,
} from "~/features/notifications/notification-state";

const row = (id: string, read: boolean): NotificationResponse => ({
  id,
  type: "SESSION_ADDED",
  targetType: null,
  targetId: null,
  params: {},
  readAt: read ? new Date("2026-10-01T10:00:00Z") : null,
  createdAt: new Date("2026-10-01T09:00:00Z"),
});

const AT = new Date("2026-10-02T10:00:00Z");

/** The design's list: six rows, three unread. */
const six = () =>
  initialState(
    [
      row("1", false),
      row("2", false),
      row("3", false),
      row("4", true),
      row("5", true),
      row("6", true),
    ],
    null,
    { unread: 3, total: 6 }
  );

describe("notification list state", () => {
  it("marking one read lowers the unread count and drops it from the unread tab", () => {
    let state = six();
    state = appendPage(
      state,
      "unread",
      [row("1", false), row("2", false), row("3", false)],
      null
    );
    state = markRead(state, "2", AT);
    expect(state.counts).toEqual({ unread: 2, total: 6 });
    expect(state.all.items.find((n) => n.id === "2")?.readAt).toEqual(AT);
    expect(state.unread.items.map((n) => n.id)).toEqual(["1", "3"]);
  });

  it("counts a row once, however often it is marked", () => {
    const once = markRead(six(), "1", AT);
    const twice = markRead(once, "1", AT);
    expect(twice.counts.unread).toBe(2);
    expect(markRead(six(), "4", AT).counts.unread).toBe(3);
  });

  it("never takes the count below zero", () => {
    const state = { ...six(), counts: { unread: 0, total: 6 } };
    expect(markRead(state, "1", AT).counts.unread).toBe(0);
  });

  it("read-all clears every badge, empties the unread tab and counts zero", () => {
    const state = markAllRead(six(), AT);
    expect(state.counts).toEqual({ unread: 0, total: 6 });
    expect(state.all.items.every((n) => n.readAt !== null)).toBe(true);
    expect(state.unread).toEqual({ items: [], nextCursor: null, loaded: true });
    // The rows already read keep their own time.
    expect(state.all.items.find((n) => n.id === "4")?.readAt).toEqual(
      new Date("2026-10-01T10:00:00Z")
    );
  });

  it("appends a page without repeating a row the tab holds", () => {
    const state = appendPage(
      six(),
      "all",
      [row("6", true), row("7", true)],
      "next"
    );
    expect(state.all.items.map((n) => n.id)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
    ]);
    expect(state.all.nextCursor).toBe("next");
  });

  it("starts with the unread tab not loaded", () => {
    expect(six().unread.loaded).toBe(false);
  });
});
