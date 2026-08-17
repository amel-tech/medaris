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
