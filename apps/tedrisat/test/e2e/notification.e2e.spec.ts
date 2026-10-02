import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { notifications } from "../../src/database/schema/notification.schema";
import { NotificationService } from "../../src/notification/notification.service";
import {
  createTestApp,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * MDRS-167: the in-app notification list. TEST_USER_ID is the reader;
 * OTHER_USER_ID has notifications of their own that must never reach them.
 */

const MINUTE = 60 * 1000;
const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * MINUTE);

describe("notifications (e2e)", () => {
  let app: INestApplication;
  let otherApp: INestApplication;
  let db: DatabaseService["db"];
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    otherApp = await createTestApp({ authUserId: OTHER_USER_ID });
    const databaseService = app.get(DatabaseService);
    db = databaseService.db;
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("notifications");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("notifications");
    await app.close();
    await otherApp.close();
  });

  /** Seeds the reader's six notifications of the design, three unread; newest first by minutes ago. */
  const seed = async (userId = TEST_USER_ID) => {
    const rows = [
      { type: "SESSION_CANCELLED", ago: 10, read: false },
      { type: "SESSION_ADDED", ago: 20, read: false },
      { type: "SESSION_CANCELLED", ago: 30, read: false },
      { type: "ENROLLMENT_APPROVED", ago: 40, read: true },
      { type: "ENROLLMENT_APPROVED", ago: 50, read: true },
      { type: "SESSION_ADDED", ago: 60, read: true },
    ];
    const inserted = await db
      .insert(notifications)
      .values(
        rows.map((r) => ({
          userId,
          type: r.type,
          targetType: "COURSE",
          targetId: "c0000000-0000-4000-8000-000000000001",
          params: { courseTitle: "Emsile ve Bina", source: "Beyazıt Köşkü" },
          readAt: r.read ? at(r.ago - 1) : null,
          createdAt: at(r.ago),
        }))
      )
      .returning();
    return inserted;
  };

  const counts = async (target = app) =>
    (
      await request(target.getHttpServer())
        .get("/notifications/unread-count")
        .expect(200)
    ).body;

  it("lists newest first, with counts for the two tabs", async () => {
    await seed();

    const list = await request(app.getHttpServer())
      .get("/notifications")
      .expect(200);
    expect(list.body.items).toHaveLength(6);
    expect(list.body.nextCursor).toBeNull();
    const times = list.body.items.map((n: { createdAt: string }) =>
      Date.parse(n.createdAt)
    );
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(list.body.items[0]).toMatchObject({
      type: "SESSION_CANCELLED",
      targetType: "COURSE",
      readAt: null,
      params: { courseTitle: "Emsile ve Bina", source: "Beyazıt Köşkü" },
    });

    expect(await counts()).toEqual({ unread: 3, total: 6 });

    const unread = await request(app.getHttpServer())
      .get("/notifications?status=unread")
      .expect(200);
    expect(unread.body.items).toHaveLength(3);
    expect(
      unread.body.items.every((n: { readAt: unknown }) => n.readAt === null)
    ).toBe(true);
  });

  it("lists only the types asked for, and rejects an unknown type with 400 (MDRS-179)", async () => {
    await seed();
    const res = await request(app.getHttpServer())
      .get("/notifications?types=SESSION_ADDED,ENROLLMENT_APPROVED")
      .expect(200);
    expect(res.body.items).toHaveLength(4);
    expect(
      res.body.items.every((n: { type: string }) =>
        ["SESSION_ADDED", "ENROLLMENT_APPROVED"].includes(n.type)
      )
    ).toBe(true);
    const unread = await request(app.getHttpServer())
      .get("/notifications?types=SESSION_CANCELLED&status=unread")
      .expect(200);
    expect(unread.body.items).toHaveLength(2);
    await request(app.getHttpServer())
      .get("/notifications?types=SESSION_ADDED,NOPE")
      .expect(400);
  });

  it("pages with an opaque cursor without skipping or repeating a row", async () => {
    await seed();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await request(app.getHttpServer())
        .get("/notifications")
        .query({ limit: 4, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...res.body.items.map((n: { id: string }) => n.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 5);

    expect(pages).toBe(2);
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  it("pages rows that share one timestamp by id", async () => {
    const same = at(5);
    await db.insert(notifications).values(
      Array.from({ length: 5 }, () => ({
        userId: TEST_USER_ID,
        type: "SESSION_ADDED",
        createdAt: same,
      }))
    );
    const first = await request(app.getHttpServer())
      .get("/notifications?limit=2")
      .expect(200);
    const second = await request(app.getHttpServer())
      .get("/notifications")
      .query({ limit: 10, cursor: first.body.nextCursor })
      .expect(200);
    const ids = [...first.body.items, ...second.body.items].map(
      (n: { id: string }) => n.id
    );
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("rejects a bad filter, page size or cursor with 400", async () => {
    await request(app.getHttpServer())
      .get("/notifications?status=archived")
      .expect(400);
    await request(app.getHttpServer())
      .get("/notifications?limit=many")
      .expect(400);
    const res = await request(app.getHttpServer())
      .get("/notifications?cursor=garbage")
      .expect(400);
    expect(JSON.stringify(res.body)).toContain("INVALID_NOTIFICATION_CURSOR");
  });

  it("never returns, counts or changes another person's notification", async () => {
    const [mine] = await seed();
    const [theirs] = await seed(OTHER_USER_ID);

    const list = await request(app.getHttpServer())
      .get("/notifications")
      .expect(200);
    expect(list.body.items.map((n: { id: string }) => n.id)).not.toContain(
      theirs.id
    );
    expect(list.body.items).toHaveLength(6);

    await request(app.getHttpServer())
      .post(`/notifications/${theirs.id}/read`)
      .expect(404);
    expect(await counts(otherApp)).toEqual({ unread: 3, total: 6 });

    await request(app.getHttpServer())
      .post("/notifications/read-all")
      .expect(200);
    expect(await counts(otherApp)).toEqual({ unread: 3, total: 6 });
    expect(await counts()).toEqual({ unread: 0, total: 6 });
    expect(mine.userId).toBe(TEST_USER_ID);
  });

  it("marks one read, keeps the first readAt, and answers 404 for an unknown id", async () => {
    const rows = await seed();
    const target = rows.find((r) => r.readAt === null);
    if (!target) throw new Error("seed has an unread row");

    const first = await request(app.getHttpServer())
      .post(`/notifications/${target.id}/read`)
      .expect(200);
    expect(first.body.id).toBe(target.id);
    expect(first.body.readAt).not.toBeNull();
    expect(await counts()).toEqual({ unread: 2, total: 6 });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const again = await request(app.getHttpServer())
      .post(`/notifications/${target.id}/read`)
      .expect(200);
    expect(again.body.readAt).toBe(first.body.readAt);

    await request(app.getHttpServer())
      .post("/notifications/00000000-0000-4000-8000-000000000000/read")
      .expect(404);
    await request(app.getHttpServer())
      .post("/notifications/not-a-uuid/read")
      .expect(400);
  });

  it("read-all clears the unread count and says how many it changed", async () => {
    await seed();
    const res = await request(app.getHttpServer())
      .post("/notifications/read-all")
      .expect(200);
    expect(res.body).toEqual({ updated: 3 });
    expect(await counts()).toEqual({ unread: 0, total: 6 });

    const unread = await request(app.getHttpServer())
      .get("/notifications?status=unread")
      .expect(200);
    expect(unread.body.items).toEqual([]);

    const again = await request(app.getHttpServer())
      .post("/notifications/read-all")
      .expect(200);
    expect(again.body).toEqual({ updated: 0 });
  });

  it("starts empty", async () => {
    expect(await counts()).toEqual({ unread: 0, total: 0 });
    const list = await request(app.getHttpServer())
      .get("/notifications")
      .expect(200);
    expect(list.body).toEqual({ items: [], nextCursor: null });
  });

  it("stores what a producer hands NotificationService.notify", async () => {
    await app.get(NotificationService).notify(
      {
        userId: TEST_USER_ID,
        type: "ENROLLMENT_REJECTED",
        targetType: "COURSE",
        targetId: "c0000000-0000-4000-8000-000000000001",
        params: { courseTitle: "Siyer okumaları", reason: "Kontenjan doldu" },
      },
      { userId: OTHER_USER_ID, type: "ENROLLMENT_APPROVED" }
    );
    const list = await request(app.getHttpServer())
      .get("/notifications")
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      type: "ENROLLMENT_REJECTED",
      params: { reason: "Kontenjan doldu" },
      readAt: null,
    });
    expect(await counts(otherApp)).toEqual({ unread: 1, total: 1 });
  });
});
