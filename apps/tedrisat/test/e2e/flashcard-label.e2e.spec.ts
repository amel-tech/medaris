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

  it("deletes a label the caller owns", async () => {
    const created = await createLabel();

    const response = await request(app.getHttpServer()).delete(
      `/flashcard-label/delete/${created.body.id}`
    );

    expect(response.status).toBe(200);

    // Not `expect(response.body).toBe(true)`: the handler returns a bare
    // boolean, which supertest parses into `{}`. Assert the row is gone —
    // which is what the caller actually cares about.
    //
    // MDRS-56 changed what "gone" looks like on the wire. The read route used
    // to answer 200 with an empty body for an id that does not exist; it now
    // goes through `assertOwner`, so a deleted label is an honest 404. The old
    // `body?.id` assertion still passed either way, which is exactly why it is
    // pinned to the status code now.
    const after = await request(app.getHttpServer()).get(
      `/flashcard-label/${created.body.id}`
    );
    expect(after.status).toBe(404);
    expect(after.body?.id).toBeUndefined();
  });

  it("returns 404 when the label does not exist", async () => {
    const response = await request(app.getHttpServer()).delete(
      `/flashcard-label/delete/${SOME_UUID}`
    );

    expect(response.status).toBe(404);
  });
});

/**
 * The ownership half of MDRS-27, and the reason it needs its own app.
 *
 * `createTestApp({ authUserId })` stubs the guard to impersonate ONE user, so a
 * single app cannot both own a row and attack it. The row is therefore seeded
 * as TEST_USER_ID through the API, then a SECOND app authenticated as
 * OTHER_USER_ID attacks it — which is exactly the shape of the real attack: a
 * perfectly valid token belonging to somebody else.
 *
 * Before the fix both routes reached `delete ... where id = ?` with no owner
 * check, so these cases returned 200 and the row was gone.
 */
describe("Label deletion — ownership (e2e)", () => {
  let ownerApp: INestApplication;
  let attackerApp: INestApplication;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    ownerApp = await createTestApp({ authUserId: TEST_USER_ID });
    attackerApp = await createTestApp({ authUserId: OTHER_USER_ID });
    dbUtils = new TestDatabaseUtils(
      ownerApp.get<DatabaseService>(DatabaseService)
    );
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
    await ownerApp.close();
    await attackerApp.close();
  });

  it("refuses to delete a flashcard label owned by another user, and the row survives", async () => {
    const created = await request(ownerApp.getHttpServer())
      .post("/flashcard-label/create")
      .send({ title: "Kelime Hazinesi", scope: Scope.PERSONAL });
    expect(created.status).toBe(201);

    const attack = await request(attackerApp.getHttpServer()).delete(
      `/flashcard-label/delete/${created.body.id}`
    );

    expect(attack.status).toBe(403);

    // The finding that mattered was destructive, so assert survival rather
    // than trusting the status code alone.
    const stillThere = await request(ownerApp.getHttpServer()).get(
      `/flashcard-label/${created.body.id}`
    );
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.id).toBe(created.body.id);
  });

  it("refuses to delete a deck label owned by another user, and the row survives", async () => {
    const created = await request(ownerApp.getHttpServer())
      .post("/flashcard-deck-label/create")
      .send({ title: "Seviye A1", scope: Scope.PUBLIC });
    expect(created.status).toBe(201);

    const attack = await request(attackerApp.getHttpServer()).delete(
      `/flashcard-deck-label/delete/${created.body.id}`
    );

    expect(attack.status).toBe(403);

    const stillThere = await request(ownerApp.getHttpServer()).get(
      `/flashcard-deck-label/${created.body.id}`
    );
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.id).toBe(created.body.id);
  });

  // PUBLIC scope is visibility, not shared ownership — there is no role model
  // here, so nobody but the owner may delete. Pinned so a later "public labels
  // are community-owned" change has to argue with a test.
  it("refuses even when the label is PUBLIC", async () => {
    const created = await request(ownerApp.getHttpServer())
      .post("/flashcard-label/create")
      .send({ title: "Ortak Etiket", scope: Scope.PUBLIC });
    expect(created.status).toBe(201);

    const attack = await request(attackerApp.getHttpServer()).delete(
      `/flashcard-label/delete/${created.body.id}`
    );

    expect(attack.status).toBe(403);
  });
});

/**
 * MDRS-56 — the read half of the same defect.
 *
 * `GET /:id` and `GET /getStats/:id` on both controllers carried the class
 * guard but no ownership assertion, so an authenticated caller who knew or
 * brute-forced a UUID read another user's label.
 *
 * Measured against unmodified handlers rather than asserted from reading them:
 * the four `:id` attacks below returned 200 carrying the owner's row, PUBLIC
 * and PERSONAL alike, and so did the two `getById` not-found cases. Both
 * `getStats` routes answered 500 whether the id existed or not — they
 * disclosed nothing only because they are independently broken, see
 * `does not deny the owner their own label stats` below for the column-name
 * drift behind that.
 *
 * Two apps for the same reason the delete block needs two — `createTestApp`
 * stubs the guard to impersonate exactly one user, so one app cannot both own
 * a row and attack it.
 */
describe("Label reads — ownership (e2e)", () => {
  let ownerApp: INestApplication;
  let attackerApp: INestApplication;
  let dbUtils: TestDatabaseUtils;

  beforeAll(async () => {
    ownerApp = await createTestApp({ authUserId: TEST_USER_ID });
    attackerApp = await createTestApp({ authUserId: OTHER_USER_ID });
    dbUtils = new TestDatabaseUtils(
      ownerApp.get<DatabaseService>(DatabaseService)
    );
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcard_labels", "deck_label");
    await ownerApp.close();
    await attackerApp.close();
  });

  const seedFlashcardLabel = async (scope: Scope = Scope.PERSONAL) => {
    const created = await request(ownerApp.getHttpServer())
      .post("/flashcard-label/create")
      .send({ title: "Kelime Hazinesi", scope });
    expect(created.status).toBe(201);
    return created.body.id as string;
  };

  const seedDeckLabel = async (scope: Scope = Scope.PERSONAL) => {
    const created = await request(ownerApp.getHttpServer())
      .post("/flashcard-deck-label/create")
      .send({ title: "Seviye A1", scope });
    expect(created.status).toBe(201);
    return created.body.id as string;
  };

  it("refuses to read a flashcard label owned by another user", async () => {
    const id = await seedFlashcardLabel();

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-label/${id}`
    );

    expect(attack.status).toBe(403);
    // The defect was disclosure, so assert the payload is absent rather than
    // trusting the status code alone.
    expect(attack.body?.title).toBeUndefined();
    expect(attack.body?.id).toBeUndefined();
  });

  it("refuses to read flashcard label stats owned by another user", async () => {
    const id = await seedFlashcardLabel();

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-label/getStats/${id}`
    );

    expect(attack.status).toBe(403);
    expect(attack.body?.usageCount).toBeUndefined();
  });

  it("refuses to read a deck label owned by another user", async () => {
    const id = await seedDeckLabel();

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-deck-label/${id}`
    );

    expect(attack.status).toBe(403);
    expect(attack.body?.title).toBeUndefined();
    expect(attack.body?.id).toBeUndefined();
  });

  it("refuses to read deck label stats owned by another user", async () => {
    const id = await seedDeckLabel();

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-deck-label/getStats/${id}`
    );

    expect(attack.status).toBe(403);
    expect(attack.body?.usageCount).toBeUndefined();
  });

  // The PUBLIC-scope decision, pinned. Reads are owner-only and `scope` is not
  // consulted, exactly as delete does it — see the comment on
  // FlashcardlabelController for the argument. A later "PUBLIC labels are
  // world-readable" change has to argue with this test rather than slip past
  // it, whichever way that argument goes.
  it("refuses to read a PUBLIC flashcard label owned by another user", async () => {
    const id = await seedFlashcardLabel(Scope.PUBLIC);

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-label/${id}`
    );

    expect(attack.status).toBe(403);
  });

  it("refuses to read a PUBLIC deck label owned by another user", async () => {
    const id = await seedDeckLabel(Scope.PUBLIC);

    const attack = await request(attackerApp.getHttpServer()).get(
      `/flashcard-deck-label/${id}`
    );

    expect(attack.status).toBe(403);
  });

  // 404 for a missing id, 403 for somebody else's — and yes, that difference
  // IS an existence oracle: a caller who scans ids learns which ones name a
  // real label. Pinned deliberately, not overlooked.
  //
  // MDRS-56's acceptance criteria ask for exactly these two codes, and DELETE
  // has behaved this way since MDRS-27, so hiding existence on reads alone
  // would leave the two paths disagreeing about the same rows. The
  // discriminator is a v4 UUID behind authentication, which is what makes the
  // oracle uninteresting rather than merely tolerated. If this repository ever
  // decides existence must be hidden, the fix is one ordering change inside
  // `assertOwner` that covers reads and delete together — which is the reason
  // not to fork the behaviour here.
  const missingIdRoutes = [
    `/flashcard-label/${SOME_UUID}`,
    `/flashcard-label/getStats/${SOME_UUID}`,
    `/flashcard-deck-label/${SOME_UUID}`,
    `/flashcard-deck-label/getStats/${SOME_UUID}`,
  ];

  it.each(
    missingIdRoutes
  )("GET %s returns 404 when the label does not exist", async (path) => {
    const response = await request(ownerApp.getHttpServer()).get(path);

    expect(response.status).toBe(404);
  });

  // The owner is not locked out by any of this.
  it("lets the owner read their own label", async () => {
    const id = await seedFlashcardLabel();

    const label = await request(ownerApp.getHttpServer()).get(
      `/flashcard-label/${id}`
    );

    expect(label.status).toBe(200);
    expect(label.body.id).toBe(id);
  });

  /**
   * The owner's stats read, asserted negatively on purpose.
   *
   * Both `getStats` routes are broken on main for EVERY caller, owner
   * included, and it has nothing to do with authorization. The migrations and
   * the drizzle schemas disagree about two column names, so the select throws
   * a 500 before any row is found:
   *
   *   flashcard_label_stats — migration 0007 creates "usageCount",
   *     flashcard-label.schema.ts:21 declares `integer("usage_count")`
   *   deck_label_stats      — migration 0007 creates "lable_id" (sic),
   *     flashcard-deck-label.schema.ts:39 declares `uuid("label_id")`
   *
   * Measured, not inferred: the response body is
   * `Failed query: select "id", "label_id", "usage_count", "last_used_at"
   * from "flashcard_label_stats" ...`. Nothing exercised these routes before
   * MDRS-56 — the only existing coverage was the 401 sweep, which never
   * reaches the database.
   *
   * Fixing that drift is a schema/migration change and belongs in its own
   * issue (see docs/migration/mdrs-56-flashcard-label-authz.md). What MDRS-56
   * owes is that AUTHORIZATION is not what stops the owner, so this pins the
   * two statuses this change is responsible for and deliberately does not pin
   * the third — the day the drift is fixed, this test should go green as a
   * 200 without anybody having to come back and edit it.
   */
  it("does not deny the owner their own label stats", async () => {
    const id = await seedFlashcardLabel();

    const stats = await request(ownerApp.getHttpServer()).get(
      `/flashcard-label/getStats/${id}`
    );

    expect(stats.status).not.toBe(403);
    expect(stats.status).not.toBe(404);
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
