import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { Scope } from "../../src/flashcard/domain/flashcard-label.enum";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

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

  /**
   * The other half of the ten assertions above, and the one that proves
   * MDRS-89's stub is a working key provider rather than a suppressed fetch.
   *
   * This app mounts the real `AuthGuard`, the real `JwtVerifierService` and —
   * since MDRS-89 — an in-process `PUBLIC_KEY_PROVIDER` holding this run's
   * generated public key. The token below is signed with the matching private
   * key and carries the claims the verifier requires. If the stub were merely
   * silencing the network, `getKey` would find nothing and this would be a
   * eleventh 401.
   *
   * 404, not 200: the label id is a well-formed UUID that no row uses. What
   * matters is that the request got past the guard to reach the service, which
   * a 401 would not have.
   */
  it("accepts a token minted with this run's key and reaches the route", async () => {
    const response = await request(app.getHttpServer())
      .get(`/flashcard-label/${SOME_UUID}`)
      .set("Authorization", bearerFor({ sub: TEST_USER_ID }));

    expect(response.status).toBe(404);
  });

  it("rejects a token signed with a key the realm does not publish", async () => {
    const response = await request(app.getHttpServer())
      .get(`/flashcard-label/${SOME_UUID}`)
      .set(
        "Authorization",
        bearerFor({ sub: TEST_USER_ID, header: { kid: "not-this-realm" } })
      );

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
   * The owner's stats read, now asserted positively.
   *
   * Both `getStats` routes used to 500 for EVERY caller, owner included, for
   * a reason that had nothing to do with authorization: the migrations and
   * the drizzle schemas disagreed about two column names, so the select threw
   * before any row was found —
   *
   *   flashcard_label_stats — migration 0007 created "usageCount",
   *     flashcard-label.schema.ts:21 declares `integer("usage_count")`
   *   deck_label_stats      — migration 0007 created "lable_id" (sic),
   *     flashcard-deck-label.schema.ts:39 declares `uuid("label_id")`
   *
   * MDRS-56 left that as a follow-up and this test as a negative assertion,
   * with a note saying it should go green as a 200 the day the drift was
   * fixed. Migration `0013_label_schema_drift` is that day, so the assertion
   * is the 200 and the zero-stats body the service documents — a label that
   * exists and has never been applied has no row, and that is answered with
   * zeroes rather than a 404. Asserting the body rather than the status alone
   * is what makes this a witness for the rename: a reverted migration puts
   * the 500 back.
   */
  it("gives the owner zero-valued stats for a label never applied", async () => {
    const id = await seedFlashcardLabel();

    const stats = await request(ownerApp.getHttpServer()).get(
      `/flashcard-label/getStats/${id}`
    );

    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({ labelId: id, usageCount: 0 });
    expect(stats.body.lastUsedAt).toBeNull();
  });

  it("gives the owner zero-valued stats for a deck label never applied", async () => {
    const id = await seedDeckLabel();

    const stats = await request(ownerApp.getHttpServer()).get(
      `/flashcard-deck-label/getStats/${id}`
    );

    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({ labelId: id, usageCount: 0 });
    expect(stats.body.lastUsedAt).toBeNull();
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

// Seeding shared by the two labeling blocks below. They assert opposite
// outcomes on the same endpoint, so both seed through one pair of helpers: a
// change to the deck, card or label create contract is fixed once.

/** A deck owned by `app`'s user, with one card in it. Returns both ids. */
const seedDeckWithCard = async (app: INestApplication, isPublic: boolean) => {
  const deck = await request(app.getHttpServer())
    .post("/flashcard/decks")
    .send({ title: isPublic ? "Public Deck" : "Private Deck", isPublic });
  expect(deck.status).toBe(201);

  const cards = await request(app.getHttpServer())
    .post(`/flashcard/decks/${deck.body.id}/cards`)
    .send([
      { type: "VOCABULARY", contentFront: "front 0", contentBack: "back 0" },
    ]);
  expect(cards.status).toBe(201);

  return {
    deckId: deck.body.id as string,
    cardId: cards.body[0].id as string,
  };
};

/** A label owned by `app`'s user, created through `path`. */
const seedLabel = async (
  app: INestApplication,
  path: string,
  scope: Scope = Scope.PERSONAL
) => {
  const created = await request(app.getHttpServer())
    .post(`${path}/create`)
    .send({ title: "Kelime Hazinesi", scope });
  expect(created.status).toBe(201);
  return created.body.id as string;
};

/**
 * The TARGET of a labeling, as opposed to the label itself.
 *
 * MDRS-27 asserted that the label being attached belongs to the caller and
 * left `flashcardId` / `deckId` unchecked, deferred to MDRS-26. A row could
 * therefore be written against any card or deck UUID in the system — including
 * one inside another user's private deck — and a real id answered 201 while a
 * missing one tripped the foreign key as a 500, which is an existence oracle.
 *
 * Both routes now resolve the target and assert the caller may READ it, which
 * is `assertReadable` rather than `assertOwner` on purpose: labelling a card in
 * somebody else's PUBLIC deck is a private annotation on a public thing, and
 * `privateToUserId` exists for exactly that. The three cases below pin all
 * three answers — refused for a private target, allowed for a public one,
 * allowed for your own.
 */
describe("Labeling — target readability (e2e)", () => {
  // A well-formed v4 UUID that is not in the database. `SOME_UUID` above is
  // only v4-shaped in its length: its variant nibble is `2`, which
  // `ParseUUIDPipe` tolerates but the DTOs' `@IsUUID()` does not, so a body
  // carrying it is a 400 from the pipe before any handler runs.
  const MISSING_UUID = "00000000-0000-4000-8000-000000000000";

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
    await dbUtils.cleanTables(
      "flashcard_labelings",
      "deck_labelings",
      "flashcard_labels",
      "deck_label",
      "flashcards",
      "decks"
    );
  });

  afterAll(async () => {
    await dbUtils.cleanTables(
      "flashcard_labelings",
      "deck_labelings",
      "flashcard_labels",
      "deck_label",
      "flashcards",
      "decks"
    );
    await ownerApp.close();
    await attackerApp.close();
  });

  it("refuses to label a card inside another user's private deck", async () => {
    const { cardId } = await seedDeckWithCard(ownerApp, false);
    const labelId = await seedLabel(attackerApp, "/flashcard-label");

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId, flashcardId: cardId });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");
  });

  it("refuses to label another user's private deck", async () => {
    const { deckId } = await seedDeckWithCard(ownerApp, false);
    const labelId = await seedLabel(attackerApp, "/flashcard-deck-label");

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-deck-label/labeling")
      .send({ labelId, deckId });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");
  });

  // The oracle: a card that does not exist used to reach the insert and come
  // back as a 500 from the foreign key. It is a 404 now, the same shape the
  // card routes use.
  it("answers 404, not 500, for a card that does not exist", async () => {
    const labelId = await seedLabel(attackerApp, "/flashcard-label");

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId, flashcardId: MISSING_UUID });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("CARD_NOT_FOUND");
  });

  it("answers 404, not 500, for a deck that does not exist", async () => {
    const labelId = await seedLabel(attackerApp, "/flashcard-deck-label");

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-deck-label/labeling")
      .send({ labelId, deckId: MISSING_UUID });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("DECK_NOT_FOUND");
  });

  // The counterweight, twice: readable is not the same as owned, so a PUBLIC
  // deck stays labelable by anyone, and the author is never locked out of
  // their own.
  it("lets a stranger label a card in a PUBLIC deck", async () => {
    const { cardId } = await seedDeckWithCard(ownerApp, true);
    const labelId = await seedLabel(attackerApp, "/flashcard-label");

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId, flashcardId: cardId });

    expect(response.status).toBe(201);
  });

  it("lets the author label a card in their own private deck", async () => {
    const { cardId } = await seedDeckWithCard(ownerApp, false);
    const labelId = await seedLabel(ownerApp, "/flashcard-label");

    const response = await request(ownerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId, flashcardId: cardId });

    expect(response.status).toBe(201);
  });
});

/**
 * MDRS-81. The LABEL side of a labeling, as opposed to the target above.
 *
 * `labelId` arrives in the request body, so without a check an authenticated
 * caller could hang their card or deck on another user's label, move that
 * owner's `usage_count` and write a labeling row against a label the read
 * routes already refuse them (MDRS-56). Both services now `assertOwner` the
 * label before anything else; `flashcard-label-readers.spec.ts` pins that with
 * mocks. These cases pin it against a real database, which the mocks cannot:
 * migration `0013_label_schema_drift` is what made the write path reachable at
 * all, so this is the first configuration in which the hole could be exercised.
 *
 * The target is a PUBLIC deck on purpose. The target branch lets a stranger
 * label it, so the only thing that can refuse these requests is the label
 * check — a private target would pass for the wrong reason.
 */
describe("Labeling — label ownership (e2e)", () => {
  let ownerApp: INestApplication;
  let attackerApp: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

  const tables = [
    "flashcard_labelings",
    "deck_labelings",
    "flashcard_label_stats",
    "deck_label_stats",
    "flashcard_labels",
    "deck_label",
    "flashcards",
    "decks",
  ];

  beforeAll(async () => {
    ownerApp = await createTestApp({ authUserId: TEST_USER_ID });
    attackerApp = await createTestApp({ authUserId: OTHER_USER_ID });
    databaseService = ownerApp.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...tables);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...tables);
    await ownerApp.close();
    await attackerApp.close();
  });

  const countRows = async (table: string) => {
    const result = await databaseService.db.execute(
      `SELECT count(*)::int AS n FROM "${table}"`
    );
    return (result.rows[0] as { n: number }).n;
  };

  const usageCount = async (path: string, labelId: string) => {
    const stats = await request(ownerApp.getHttpServer()).get(
      `${path}/getStats/${labelId}`
    );
    expect(stats.status).toBe(200);
    return stats.body.usageCount as number;
  };

  it("refuses to attach a card to another user's PUBLIC label and moves nothing", async () => {
    const { cardId } = await seedDeckWithCard(ownerApp, true);
    const labelId = await seedLabel(ownerApp, "/flashcard-label", Scope.PUBLIC);

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId, flashcardId: cardId });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FLASHCARD_LABEL_FORBIDDEN");
    expect(await countRows("flashcard_labelings")).toBe(0);
    expect(await usageCount("/flashcard-label", labelId)).toBe(0);
  });

  it("refuses to attach a deck to another user's PUBLIC label and moves nothing", async () => {
    const { deckId } = await seedDeckWithCard(ownerApp, true);
    const labelId = await seedLabel(
      ownerApp,
      "/flashcard-deck-label",
      Scope.PUBLIC
    );

    const response = await request(attackerApp.getHttpServer())
      .post("/flashcard-deck-label/labeling")
      .send({ labelId, deckId });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("FLASHCARD_DECK_LABEL_FORBIDDEN");
    expect(await countRows("deck_labelings")).toBe(0);
    expect(await usageCount("/flashcard-deck-label", labelId)).toBe(0);
  });

  // The counterweight: the same requests from the label's owner succeed and DO
  // move the counter, so the zero asserted above is a refusal and not a
  // counter that never moves.
  it("lets the owner apply their own label, and counts the use", async () => {
    const { cardId, deckId } = await seedDeckWithCard(ownerApp, true);
    const cardLabelId = await seedLabel(
      ownerApp,
      "/flashcard-label",
      Scope.PUBLIC
    );
    const deckLabelId = await seedLabel(
      ownerApp,
      "/flashcard-deck-label",
      Scope.PUBLIC
    );

    const cardLabeling = await request(ownerApp.getHttpServer())
      .post("/flashcard-label/labeling")
      .send({ labelId: cardLabelId, flashcardId: cardId });
    const deckLabeling = await request(ownerApp.getHttpServer())
      .post("/flashcard-deck-label/labeling")
      .send({ labelId: deckLabelId, deckId });

    expect(cardLabeling.status).toBe(201);
    expect(deckLabeling.status).toBe(201);
    expect(await countRows("flashcard_labelings")).toBe(1);
    expect(await countRows("deck_labelings")).toBe(1);
    expect(await usageCount("/flashcard-label", cardLabelId)).toBe(1);
    expect(await usageCount("/flashcard-deck-label", deckLabelId)).toBe(1);
  });
});
