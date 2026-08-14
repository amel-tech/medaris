import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { Scope } from "../../src/flashcard/domain/flashcard-label.enum";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";
const SOME_UUID = "22222222-2222-2222-2222-222222222222";

/**
 * MDRS-27. Both label controllers shipped with no guard, so all ten routes —
 * three of them mutating — answered anonymous callers.
 *
 * The first block is the one that matters, and it is deliberately built with
 * `createTestApp()` and NO `authUserId`: that is the only configuration in
 * which the REAL AuthGuard is mounted. Every other e2e file stubs the guard
 * away, which is precisely why nothing caught this — a suite that always
 * impersonates a user cannot notice that the door was never locked.
 */
describe("Label controllers — authentication (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    // No authUserId: the real guard is mounted.
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Every route on both controllers. Enumerated rather than sampled, because
  // the defect was per-route and a sample would have passed on main too.
  const routes: Array<[string, string]> = [
    ["post", "/flashcard-label/create"],
    ["delete", `/flashcard-label/delete/${SOME_UUID}`],
    ["post", "/flashcard-label/labeling"],
    ["get", `/flashcard-label/${SOME_UUID}`],
    ["get", `/flashcard-label/getStats/${SOME_UUID}`],
    ["post", "/flashcard-deck-label/create"],
    ["delete", `/flashcard-deck-label/delete/${SOME_UUID}`],
    ["post", "/flashcard-deck-label/labeling"],
    ["get", `/flashcard-deck-label/${SOME_UUID}`],
    ["get", `/flashcard-deck-label/getStats/${SOME_UUID}`],
  ];

  it.each(
    routes
  )("%s %s rejects an unauthenticated caller with 401", async (method, path) => {
    const server = request(app.getHttpServer());
    const response = await (
      server[method as "get" | "post" | "delete"] as (
        url: string
      ) => request.Test
    )(path).send({});

    expect(response.status).toBe(401);
  });
});

describe("FlashcardLabelController (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcard_labels");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcard_labels");
    await app.close();
  });

  const createLabel = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post("/flashcard-label/create")
      .send({ title: "Kelime Hazinesi", scope: Scope.PERSONAL, ...overrides });

  it("creates a label and attributes it to the token subject", async () => {
    const response = await createLabel();

    expect(response.status).toBe(201);
    expect(response.body.createdBy).toBe(TEST_USER_ID);
    expect(response.body.userId).toBe(TEST_USER_ID);
  });

  // The point of removing the fields from the DTO: with
  // `forbidNonWhitelisted`, attributing a label to somebody else is now a 400
  // rather than something the server quietly accepts.
  it("rejects a body that tries to attribute the label to another user", async () => {
    const response = await createLabel({
      createdBy: OTHER_USER_ID,
      userId: OTHER_USER_ID,
    });

    expect(response.status).toBe(400);
  });

  it("returns 400 rather than 500 for a non-UUID id", async () => {
    const response = await request(app.getHttpServer()).get(
      "/flashcard-label/not-a-uuid"
    );

    expect(response.status).toBe(400);
  });
});

describe("FlashcardDeckLabelController (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("deck_label");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("deck_label");
    await app.close();
  });

  it("creates a deck label attributed to the token subject", async () => {
    const response = await request(app.getHttpServer())
      .post("/flashcard-deck-label/create")
      .send({ title: "Seviye A1", scope: Scope.PUBLIC });

    expect(response.status).toBe(201);
    expect(response.body.createdBy).toBe(TEST_USER_ID);
  });

  it("rejects a body carrying createdBy", async () => {
    const response = await request(app.getHttpServer())
      .post("/flashcard-deck-label/create")
      .send({
        title: "Seviye A2",
        scope: Scope.PUBLIC,
        createdBy: OTHER_USER_ID,
      });

    expect(response.status).toBe(400);
  });

  it("returns 400 rather than 500 for a non-UUID id", async () => {
    const response = await request(app.getHttpServer()).get(
      "/flashcard-deck-label/not-a-uuid"
    );

    expect(response.status).toBe(400);
  });
});
