import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { MAX_BULK_ROWS } from "../../src/flashcard/flashcard-bulk.service";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * MDRS-37. The bulk create endpoint bound its body as a bare
 * `@Body() cardsDto: CreateFlashcardDto[]`, and Nest's ValidationPipe skips
 * array metatypes — so nothing checked that the body was even an array, and
 * nothing bounded how many rows a single INSERT could carry.
 */

const card = (n: number) => ({
  type: FlashcardType.VOCABULARY,
  contentFront: `front ${n}`,
  contentBack: `back ${n}`,
});

const cards = (count: number) =>
  Array.from({ length: count }, (_, i) => card(i));

/** A CSV whose headers match FLASHCARD_EXCEL_CONFIG. */
const csv = (rowCount: number) =>
  Buffer.from(
    [
      "Card Type,Content Front,Content Back",
      ...Array.from(
        { length: rowCount },
        (_, i) => `${FlashcardType.VOCABULARY},front ${i},back ${i}`
      ),
    ].join("\n"),
    "utf8"
  );

/** A second realm identity: a perfectly valid token belonging to somebody else. */
const OTHER_USER_ID = "11111111-1111-1111-1111-111111111111";

describe("Flashcard bulk create (e2e)", () => {
  let app: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let deckId: string;

  beforeAll(async () => {
    app = await createTestApp({ authUserId: TEST_USER_ID });
    dbUtils = new TestDatabaseUtils(app.get<DatabaseService>(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcards", "decks");

    const deck = await request(app.getHttpServer())
      .post("/flashcard/decks")
      .send({ title: "Colours - Vocabulary Deck", isPublic: false });
    expect(deck.status).toBe(201);
    deckId = deck.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await app.close();
  });

  const bulk = () =>
    request(app.getHttpServer()).post(`/flashcard/decks/${deckId}/cards/bulk`);

  const countCards = async () => {
    const response = await request(app.getHttpServer()).get(
      `/flashcard/cards?deckId=${deckId}`
    );
    expect(response.status).toBe(200);
    return response.body.length;
  };

  // On main this reached FlashcardService.createMany and died there with
  // `TypeError: cards.map is not a function`, surfaced as a raw 500.
  it("rejects a non-array body with 400 rather than a 500", async () => {
    const response = await bulk().send({});

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain("cards.map");
  });

  it("rejects an object wrapping the array with 400", async () => {
    const response = await bulk().send({ cards: cards(2) });

    expect(response.status).toBe(400);
  });

  // An empty array passed validation and reached `insert(...).values([])`,
  // which is invalid SQL.
  it("rejects an empty array with 400 and writes nothing", async () => {
    const response = await bulk()
      .set("Content-Type", "application/json")
      .send("[]");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BULK_PAYLOAD_INVALID");
    expect(await countCards()).toBe(0);
  });

  // The reason `ParseArrayPipe` is constructed without `items:`. With per-item
  // validation in the pipe these would be a 400 naming only the first bad row;
  // `validateCards` aggregates every one of them into the 422 RowError body.
  it("reports EVERY invalid row in one 422, not just the first", async () => {
    const response = await bulk().send([
      { type: FlashcardType.VOCABULARY, contentFront: "x", contentBack: "b 0" },
      card(1),
      { type: "NOT_A_TYPE", contentFront: "front 2", contentBack: "back 2" },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("BULK_VALIDATION_ERROR");
    expect(
      response.body.context.errors.map((e: { row: number }) => e.row)
    ).toEqual([2, 4]);
    expect(await countCards()).toBe(0);
  });

  // `validateCards` runs with whitelist/forbidNonWhitelisted, so an attempt to
  // set a server-owned column is a row error rather than a silent write.
  it("still reports an unknown property as a 422 row error", async () => {
    const response = await bulk().send([
      { ...card(0), authorId: TEST_USER_ID },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("BULK_VALIDATION_ERROR");
    expect(response.body.context.errors[0].row).toBe(2);
    expect(await countCards()).toBe(0);
  });

  it(`accepts exactly ${MAX_BULK_ROWS} cards`, async () => {
    const response = await bulk().send(cards(MAX_BULK_ROWS));

    expect(response.status).toBe(201);
    expect(response.body.count).toBe(MAX_BULK_ROWS);
  });

  it(`rejects ${MAX_BULK_ROWS + 1} cards with 422 naming the cap`, async () => {
    const response = await bulk().send(cards(MAX_BULK_ROWS + 1));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("BULK_ROW_LIMIT_EXCEEDED");
    expect(response.body.message).toContain(String(MAX_BULK_ROWS));
    // The cap must hold rather than merely be reported.
    expect(await countCards()).toBe(0);
  });

  // The import path is bounded only by a 5 MB MaxFileSizeValidator, which a
  // file this size is nowhere near.
  it(`rejects a CSV of ${MAX_BULK_ROWS + 1} data rows with the same code`, async () => {
    const file = csv(MAX_BULK_ROWS + 1);
    expect(file.length).toBeLessThan(5 * 1024 * 1024);

    const response = await request(app.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk/import`)
      .attach("file", file, {
        filename: "cards.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe("BULK_ROW_LIMIT_EXCEEDED");
    expect(await countCards()).toBe(0);
  });

  // The error body keeps the shape nizam's ImportErrorsDialog already renders,
  // so the cap needs no second code path on the client.
  it("reports the cap in the RowError shape the bulk endpoints already return", async () => {
    const response = await bulk().send(cards(MAX_BULK_ROWS + 1));

    expect(response.body.context.errors).toHaveLength(1);
    expect(response.body.context.errors[0].row).toBe(MAX_BULK_ROWS + 2);
    expect(response.body.context.errors[0].errors[0].field).toBe("cards");
  });
});

/**
 * MDRS-63. `@UseGuards(AuthGuard)` proved only that the caller held a valid
 * realm token; the deck-scoped handlers then called the bare
 * `FlashcardDeckService.findById`, which filters on `decks.id` with no
 * `authorId` predicate. Any authenticated user who knew or guessed a deck UUID
 * could write up to MAX_BULK_ROWS cards into somebody else's private deck, and
 * export every card out of it.
 *
 * `createTestApp({ authUserId })` stubs the guard to impersonate ONE user, so
 * as in `flashcard-label.e2e.spec.ts` the deck is created as TEST_USER_ID
 * through the API and a SECOND app authenticated as OTHER_USER_ID attacks it.
 *
 * The rule asserted here is owner-only: `authorId` and nothing else decides.
 * Public and shared decks are MDRS-45's scope, not this one.
 */
describe("Flashcard bulk write and export — deck ownership (e2e)", () => {
  let ownerApp: INestApplication;
  let attackerApp: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let deckId: string;

  beforeAll(async () => {
    ownerApp = await createTestApp({ authUserId: TEST_USER_ID });
    attackerApp = await createTestApp({ authUserId: OTHER_USER_ID });
    dbUtils = new TestDatabaseUtils(
      ownerApp.get<DatabaseService>(DatabaseService)
    );
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcards", "decks");

    const deck = await request(ownerApp.getHttpServer())
      .post("/flashcard/decks")
      .send({ title: "Owner's Private Deck", isPublic: false });
    expect(deck.status).toBe(201);
    expect(deck.body.authorId).toBe(TEST_USER_ID);
    deckId = deck.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await ownerApp.close();
    await attackerApp.close();
  });

  /**
   * Counted through the OWNER's app. The attacker's own read of
   * `GET cards?deckId=` is not a trustworthy witness for "nothing was
   * written" — this reads the deck as the person who owns it.
   */
  const countCards = async () => {
    const response = await request(ownerApp.getHttpServer()).get(
      `/flashcard/cards?deckId=${deckId}`
    );
    expect(response.status).toBe(200);
    return response.body.length;
  };

  it("refuses a bulk create into another user's deck, and writes nothing", async () => {
    const response = await request(attackerApp.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk`)
      .send(cards(3));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");
    // The finding is a write, so assert the absence of rows rather than
    // trusting the status code alone.
    expect(await countCards()).toBe(0);
  });

  it("refuses a file import into another user's deck, and writes nothing", async () => {
    const response = await request(attackerApp.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk/import`)
      .attach("file", csv(3), {
        filename: "cards.csv",
        contentType: "text/csv",
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");
    expect(await countCards()).toBe(0);
  });

  it("refuses a non-bulk create into another user's deck, and writes nothing", async () => {
    const response = await request(attackerApp.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards`)
      .send(cards(2));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");
    expect(await countCards()).toBe(0);
  });

  it("refuses to export another user's deck, and leaks no card content", async () => {
    // Seed as the owner so a leak would have something to leak.
    const seeded = await request(ownerApp.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk`)
      .send(cards(2));
    expect(seeded.status).toBe(201);
    expect(await countCards()).toBe(2);

    const response = await request(attackerApp.getHttpServer())
      .get(`/flashcard/decks/${deckId}/cards/bulk/export?format=csv`)
      .buffer(true);

    expect(response.status).toBe(403);
    // Read through both channels: a regression that streamed the file would
    // land in `body` as a Buffer with `text` undefined, and asserting on
    // `text ?? ""` alone would pass vacuously.
    expect(String(response.text ?? response.body ?? "")).not.toContain(
      "front 0"
    );
  });

  it("still lets the owner bulk-create and export their own deck", async () => {
    const created = await request(ownerApp.getHttpServer())
      .post(`/flashcard/decks/${deckId}/cards/bulk`)
      .send(cards(2));
    expect(created.status).toBe(201);
    expect(created.body.count).toBe(2);

    const exported = await request(ownerApp.getHttpServer()).get(
      `/flashcard/decks/${deckId}/cards/bulk/export?format=csv`
    );
    expect(exported.status).toBe(200);
  });

  /**
   * `isPublic` is visibility, not shared ownership: a public deck is readable
   * and collectable by anyone, but writing cards into it is still the author's
   * privilege alone. This repository has no role model, so there is nobody who
   * may write on the author's behalf. Pinned the way
   * `flashcard-label.e2e.spec.ts` pins the same rule for PUBLIC labels, so a
   * later "public decks are community-editable" change has to argue with a
   * test rather than slip through.
   */
  it("refuses a bulk create even when the deck is public", async () => {
    const publicDeck = await request(ownerApp.getHttpServer())
      .post("/flashcard/decks")
      .send({ title: "Owner's Public Deck", isPublic: true });
    expect(publicDeck.status).toBe(201);
    expect(publicDeck.body.isPublic).toBe(true);

    const response = await request(attackerApp.getHttpServer())
      .post(`/flashcard/decks/${publicDeck.body.id}/cards/bulk`)
      .send(cards(3));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("DECK_FORBIDDEN");

    const cardsInPublicDeck = await request(ownerApp.getHttpServer()).get(
      `/flashcard/cards?deckId=${publicDeck.body.id}`
    );
    expect(cardsInPublicDeck.status).toBe(200);
    expect(cardsInPublicDeck.body).toHaveLength(0);
  });

  /**
   * The 404/403 split is deliberate and matches `KoskService.assertOwner` and
   * the label routes: an id that is not there is a 404, an id that is there
   * but belongs to somebody else is a 403. That does tell a caller which UUIDs
   * exist, which is defensible only because deck ids are v4 UUIDs and are not
   * enumerable in practice; a blanket 404 would make a genuine permission
   * problem indistinguishable from a mistyped id. Pinned so a later change has
   * to argue with a test.
   */
  it("answers 404, not 403, for a deck id that does not exist", async () => {
    const response = await request(attackerApp.getHttpServer())
      .post(`/flashcard/decks/00000000-0000-4000-8000-000000000000/cards/bulk`)
      .send(cards(1));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("DECK_NOT_FOUND");
  });
});
