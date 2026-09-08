import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp, TEST_USER_ID } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";

/**
 * MDRS-31. Nothing in the monorepo counted requests: `applyGlobalMiddleware`
 * installed cors, helmet, compression, a pipe and a filter, and a single client
 * could post 5MB workbooks to the import route as fast as the process could
 * parse them.
 *
 * Both assertions below fail if the `APP_GUARD` registration in
 * libs/common/src/throttler/throttler.module.ts is removed — the first because
 * nothing answers 429 at all, the second because the unauthenticated flood goes
 * back to costing an AuthGuard round trip per request.
 */

/** The shipped default for the bulk routes, deliberately not set by this spec. */
const BULK_LIMIT = 10;

/** What this spec narrows the ordinary per-route budget to, for speed. */
const FLOOD_LIMIT = 5;

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

/** A one-row CSV whose headers match FLASHCARD_EXCEL_CONFIG. */
const csv = (n: number) =>
  Buffer.from(
    [
      "Card Type,Content Front,Content Back",
      `${FlashcardType.VOCABULARY},front ${n},back ${n}`,
    ].join("\n"),
    "utf8"
  );

describe("Rate limiting (e2e)", () => {
  describe("the bulk import route", () => {
    let app: INestApplication;
    let dbUtils: TestDatabaseUtils;
    let deckId: string;

    beforeAll(async () => {
      app = await createTestApp({ authUserId: TEST_USER_ID });
      dbUtils = new TestDatabaseUtils(
        app.get<DatabaseService>(DatabaseService)
      );
      await dbUtils.cleanTables("flashcards", "decks");

      const deck = await request(app.getHttpServer())
        .post("/flashcard/decks")
        .send({ title: "Rate limit deck", isPublic: false });
      expect(deck.status).toBe(201);
      deckId = deck.body.id;
    });

    afterAll(async () => {
      await dbUtils.cleanTables("flashcards", "decks");
      await app.close();
    });

    const importCsv = (n: number) =>
      request(app.getHttpServer())
        .post(`/flashcard/decks/${deckId}/cards/bulk/import`)
        .attach("file", csv(n), {
          filename: "cards.csv",
          contentType: "text/csv",
        });

    // Sequential on purpose: the storage counts hits as they arrive, and a
    // parallel burst would make "the 11th" a property of scheduling rather
    // than of the limit.
    it(`admits ${BULK_LIMIT} imports and answers 429 to the next one`, async () => {
      for (let n = 0; n < BULK_LIMIT; n++) {
        const response = await importCsv(n);

        expect(response.status).toBe(201);
      }

      const refused = await importCsv(BULK_LIMIT);

      expect(refused.status).toBe(429);
      // Without this header a client has nothing to back off by; the guard
      // sets it to the seconds left in the window.
      expect(refused.headers["retry-after"]).toBeDefined();
      expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    });
  });

  describe("a flood of unauthenticated requests", () => {
    let app: INestApplication;
    const previousLimit = process.env.THROTTLE_LIMIT;

    beforeAll(async () => {
      // Read by the module factory when the container is initialised, so it has
      // to be set before the app is created. The bulk budget is left alone —
      // the route used here is an ordinary guarded one.
      process.env.THROTTLE_LIMIT = String(FLOOD_LIMIT);
      // No authUserId: this app keeps the real AuthGuard, which is the whole
      // point of the assertion below.
      app = await createTestApp();
    });

    afterAll(async () => {
      if (previousLimit === undefined) {
        delete process.env.THROTTLE_LIMIT;
      } else {
        process.env.THROTTLE_LIMIT = previousLimit;
      }
      await app.close();
    });

    // Nest runs global guards before controller-level ones. If the throttler
    // were registered on the controllers instead, every request in this burst
    // would reach AuthGuard first and answer 401 — and an attacker sending an
    // unknown `kid` would get a JWKS fetch per request out of it.
    it("is refused with 429 rather than answered 401 by AuthGuard", async () => {
      const statuses: number[] = [];

      for (let n = 0; n <= FLOOD_LIMIT; n++) {
        const response = await request(app.getHttpServer()).get(
          `/flashcard/cards/${MISSING_UUID}`
        );

        statuses.push(response.status);
      }

      expect(statuses.slice(0, FLOOD_LIMIT)).toEqual(
        Array(FLOOD_LIMIT).fill(401)
      );
      expect(statuses[FLOOD_LIMIT]).toBe(429);
    });
  });
});
