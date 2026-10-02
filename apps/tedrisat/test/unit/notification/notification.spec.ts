import { InvalidNotificationCursorError } from "../../../src/notification/errors/invalid-notification-cursor.error";
import { NotificationNotFoundError } from "../../../src/notification/errors/notification-not-found.error";
import { NotificationRepository } from "../../../src/notification/notification.repository";
import {
  MAX_PAGE_SIZE,
  NotificationService,
} from "../../../src/notification/notification.service";
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "../../../src/notification/notification-cursor";
import type { INotification } from "../../../src/notification/notification-types";

const USER = "a0000000-0000-4000-8000-00000000000a";
const ID = "b0000000-0000-4000-8000-00000000000b";

const row = (n: number): INotification => ({
  id: `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  type: "SESSION_CANCELLED",
  targetType: null,
  targetId: null,
  params: {},
  readAt: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, 0, n)),
});

const serviceWith = (repo: Partial<NotificationRepository>) =>
  new NotificationService(repo as NotificationRepository);

describe("notification cursor (MDRS-167)", () => {
  it("round-trips a position", () => {
    const cursor = { createdAt: new Date("2026-10-01T08:40:00.123Z"), id: ID };
    expect(decodeNotificationCursor(encodeNotificationCursor(cursor))).toEqual(
      cursor
    );
  });

  it.each([
    ["not base64 of a position", "!!!"],
    ["no separator", Buffer.from("12345").toString("base64url")],
    ["a non-numeric time", Buffer.from(`abc.${ID}`).toString("base64url")],
    ["a non-uuid id", Buffer.from("1790000000000.nope").toString("base64url")],
    ["an empty string", ""],
  ])("refuses %s", (_name, raw) => {
    expect(() => decodeNotificationCursor(raw)).toThrow(
      InvalidNotificationCursorError
    );
  });

  it("refuses a time beyond the Date range", () => {
    const raw = Buffer.from(`9007199254740991.${ID}`).toString("base64url");
    expect(() => decodeNotificationCursor(raw)).toThrow(
      InvalidNotificationCursorError
    );
  });
});

describe("NotificationService (MDRS-167)", () => {
  it("returns a full page with a cursor when one more row exists", async () => {
    const findPage = vi.fn().mockResolvedValue([row(3), row(2), row(1)]);
    const page = await serviceWith({ findPage }).list(USER, {
      status: "all",
      limit: 2,
    });

    expect(findPage).toHaveBeenCalledWith(USER, {
      status: "all",
      cursor: null,
      limit: 2,
    });
    expect(page.items.map((n) => n.id)).toEqual([row(3).id, row(2).id]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeNotificationCursor(page.nextCursor as string)).toEqual({
      createdAt: row(2).createdAt,
      id: row(2).id,
    });
  });

  it("has no cursor on the last page", async () => {
    const findPage = vi.fn().mockResolvedValue([row(2), row(1)]);
    const page = await serviceWith({ findPage }).list(USER, {
      status: "unread",
      limit: 2,
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("clamps the page size to 1..MAX and decodes the cursor it is given", async () => {
    const findPage = vi.fn().mockResolvedValue([]);
    const cursor = encodeNotificationCursor({
      createdAt: row(1).createdAt,
      id: row(1).id,
    });
    const service = serviceWith({ findPage });

    await service.list(USER, { status: "all", limit: 9999, cursor });
    expect(findPage.mock.calls[0][1]).toMatchObject({
      limit: MAX_PAGE_SIZE,
      cursor: { createdAt: row(1).createdAt, id: row(1).id },
    });

    await service.list(USER, { status: "all", limit: -4 });
    expect(findPage.mock.calls[1][1].limit).toBe(1);
  });

  it("answers 404 for a notification the caller does not have", async () => {
    const markRead = vi.fn().mockResolvedValue(null);
    await expect(
      serviceWith({ markRead }).markRead(USER, ID)
    ).rejects.toBeInstanceOf(NotificationNotFoundError);
    expect(markRead).toHaveBeenCalledWith(USER, ID);
  });

  it("reports how many read-all changed", async () => {
    const markAllRead = vi.fn().mockResolvedValue(3);
    await expect(
      serviceWith({ markAllRead }).markAllRead(USER)
    ).resolves.toEqual({ updated: 3 });
  });

  it("writes nothing for no notifications and one batch otherwise", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const service = serviceWith({ insert });
    await service.notify();
    await service.notify(
      { userId: USER, type: "SESSION_CANCELLED" },
      { userId: ID, type: "SESSION_ADDED" }
    );
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).toHaveLength(2);
  });
});
