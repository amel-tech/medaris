import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-31. Nothing in the monorepo counted requests: `applyGlobalMiddleware`
 * installed cors, helmet, compression, a pipe and a filter, and a single client
 * could post 5MB workbooks to the import route as fast as the process could
 * parse them.
 *
 * Since the 2026-10-12 incident the limit has two layers
 * (libs/common/src/throttler/throttler.module.ts): an address layer ahead of
 * `AuthGuard`, and a per-user layer after it, keyed by the token's `sub`.
 * Every request below comes from one loopback address, as nearly every
 * request in production comes from the proxy's or the web server's — which is
 * why, keyed by address alone, a few hundred people signing in used up one
 * shared budget.
 *
 * The flood test fails if the `APP_GUARD` registration in throttler.module.ts
 * is removed — nothing answers 429 at all, and the unauthenticated flood goes
 * back to costing an AuthGuard round trip per request. The per-user tests fail
 * if the `APP_INTERCEPTOR` registration is removed, or if its key falls back to
 * the address.
 */

/** The shipped default for the bulk routes, deliberately not set by this spec. */
const BULK_LIMIT = 10;

/** What this spec narrows the address layer's budget to, for speed. */
const FLOOD_LIMIT = 5;

/** What this spec narrows the per-user layer's budget to, for speed. */
const USER_LIMIT = 5;

const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

const IMPORTER = "a1000000-0000-4000-8000-000000000001";
const NEIGHBOUR = "a1000000-0000-4000-8000-000000000002";
const FIRST_USER = "a1000000-0000-4000-8000-000000000003";
const SECOND_USER = "a1000000-0000-4000-8000-000000000004";
const THIRD_USER = "a1000000-0000-4000-8000-000000000005";

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
    const deckIds = new Map<string, string>();

    beforeAll(async () => {
      // No authUserId: two people sign in with tokens of their own, so the
      // per-user layer sees two `sub`s arriving from one address.
      app = await createTestApp();
      dbUtils = new TestDatabaseUtils(
        app.get<DatabaseService>(DatabaseService)
      );
      await dbUtils.cleanTables("flashcards", "decks");

      for (const sub of [IMPORTER, NEIGHBOUR]) {
        const deck = await request(app.getHttpServer())
          .post("/flashcard/decks")
          .set("Authorization", bearerFor({ sub }))
          .send({ title: "Rate limit deck" });
        expect(deck.status).toBe(201);
        deckIds.set(sub, deck.body.id);
      }
    });

    afterAll(async () => {
      await dbUtils.cleanTables("flashcards", "decks");
      await app.close();
    });

    const importCsv = (sub: string, n: number) =>
      request(app.getHttpServer())
        .post(`/flashcard/decks/${deckIds.get(sub)}/cards/bulk/import`)
        .set("Authorization", bearerFor({ sub }))
        .attach("file", csv(n), {
          filename: "cards.csv",
          contentType: "text/csv",
        });

    // Sequential on purpose: the storage counts hits as they arrive, and a
    // parallel burst would make "the 11th" a property of scheduling rather
    // than of the limit.
    it(`admits ${BULK_LIMIT} imports per user, answers 429 to the next one, and not to another user`, async () => {
      for (let n = 0; n < BULK_LIMIT; n++) {
        const response = await importCsv(IMPORTER, n);

        expect(response.status).toBe(201);
      }

      const refused = await importCsv(IMPORTER, BULK_LIMIT);

      expect(refused.status).toBe(429);
      // Without this header a client has nothing to back off by; the layer
      // sets it to the seconds left in the block.
      expect(refused.headers["retry-after"]).toBeDefined();
      expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);

      // Same address, same route: keyed by address, this was one budget of
      // ten for the whole platform.
      const neighbour = await importCsv(NEIGHBOUR, 0);

      expect(neighbour.status).toBe(201);
    });
  });

  describe("the per-user layer", () => {
    let app: INestApplication;
    const previousUserLimit = process.env.THROTTLE_USER_LIMIT;

    beforeAll(async () => {
      // Read by the module factory when the container is initialised, so it
      // has to be set before the app is created. The address layer keeps its
      // default, far above anything sent here.
      process.env.THROTTLE_USER_LIMIT = String(USER_LIMIT);
      app = await createTestApp();
    });

    afterAll(async () => {
      if (previousUserLimit === undefined) {
        delete process.env.THROTTLE_USER_LIMIT;
      } else {
        process.env.THROTTLE_USER_LIMIT = previousUserLimit;
      }
      await app.close();
    });

    const me = (sub: string) =>
      request(app.getHttpServer())
        .get("/me")
        .set("Authorization", bearerFor({ sub }));

    it("answers 429 to one user past the per-user limit", async () => {
      for (let n = 0; n < USER_LIMIT; n++) {
        expect((await me(FIRST_USER)).status).toBe(200);
      }

      const refused = await me(FIRST_USER);

      expect(refused.status).toBe(429);
      expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("keeps two users on the same address in separate budgets", async () => {
      for (let n = 0; n < USER_LIMIT; n++) {
        expect((await me(SECOND_USER)).status).toBe(200);
      }
      expect((await me(SECOND_USER)).status).toBe(429);

      expect((await me(THIRD_USER)).status).toBe(200);
    });

    it("does not count requests without a token against a per-user budget", async () => {
      // `/health` has no AuthGuard. Keyed by address, these would share one
      // person's budget with every signed-out visitor; the address layer, with
      // a budget sized for a shared address, is what counts them.
      for (let n = 0; n <= USER_LIMIT * 2; n++) {
        const response = await request(app.getHttpServer()).get("/health");

        expect(response.status).toBe(200);
      }
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
