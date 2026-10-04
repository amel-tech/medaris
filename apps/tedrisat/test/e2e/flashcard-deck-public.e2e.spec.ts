import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import {
  createTestApp,
  OTHER_USER_ID,
  TEST_USER_ID,
} from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor, mintTestToken } from "../helpers/test-keycloak.helper";

/**
 * MDRS-45 — a caller with no token reads public decks.
 *
 * This suite deliberately does NOT pass `authUserId` to `createTestApp`: that
 * option replaces `AuthGuard` with a stub that always signs the request in,
 * which would make every "no token" test below pass or fail for the wrong
 * reason. The app here runs the real `AuthGuard` and `JwtVerifierService`
 * against the run's stubbed signing key, so a request carries exactly the
 * header the test gives it — none, a valid token, or a broken one.
 *
 * Each `it` names the acceptance criterion it pins. AC-6 (the marker survives
 * MDRS-44's closed-by-default flip) cannot be exercised before that flip
 * exists; `authz.guard.spec.ts` pins the branch it rests on instead.
 */

const DECK_NOT_FOUND = "DECK_NOT_FOUND";
const ABSENT_ID = "00000000-0000-4000-8000-000000000000";

describe("Flashcard decks — anonymous access (e2e)", () => {
  let app: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let publicDeckId: string;
  let privateDeckId: string;

  const owner = () => bearerFor({ sub: TEST_USER_ID });
  const stranger = () => bearerFor({ sub: OTHER_USER_ID });

  beforeAll(async () => {
    app = await createTestApp();
    dbUtils = new TestDatabaseUtils(app.get<DatabaseService>(DatabaseService));
  });

  beforeEach(async () => {
    await dbUtils.cleanTables("flashcards", "decks");

    const publicDeck = await request(app.getHttpServer())
      .post("/flashcard/decks")
      .set("Authorization", owner())
      .send({ title: "Owner's Public Deck" });
    expect(publicDeck.status).toBe(201);
    publicDeckId = publicDeck.body.id;
    // Only the başnazım publishes (MDRS-148), so the row is written as his
    // approval leaves it.
    await dbUtils.publishDeck(publicDeckId);

    const privateDeck = await request(app.getHttpServer())
      .post("/flashcard/decks")
      .set("Authorization", owner())
      .send({ title: "Owner's Private Deck" });
    expect(privateDeck.status).toBe(201);
    privateDeckId = privateDeck.body.id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables("flashcards", "decks");
    await app.close();
  });

  it("AC-1: reads a public deck with no token", async () => {
    const response = await request(app.getHttpServer()).get(
      `/flashcard/decks/${publicDeckId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(publicDeckId);
    expect(response.body.title).toBe("Owner's Public Deck");
  });

  it("AC-2: answers a private deck exactly as a deck that does not exist", async () => {
    const privateDeck = await request(app.getHttpServer()).get(
      `/flashcard/decks/${privateDeckId}`
    );
    const absentDeck = await request(app.getHttpServer()).get(
      `/flashcard/decks/${ABSENT_ID}`
    );

    expect(privateDeck.status).toBe(404);
    expect(privateDeck.status).toBe(absentDeck.status);
    expect(privateDeck.body.code).toBe(DECK_NOT_FOUND);
    expect(privateDeck.body.code).toBe(absentDeck.body.code);
    expect(privateDeck.body.message).toBe(
      absentDeck.body.message.replace(ABSENT_ID, privateDeckId)
    );
    expect(JSON.stringify(privateDeck.body)).not.toContain(
      "Owner's Private Deck"
    );
  });

  it("AC-3: lists public decks only", async () => {
    const response = await request(app.getHttpServer()).get("/flashcard/decks");

    expect(response.status).toBe(200);
    const ids = response.body.map((deck: { id: string }) => deck.id);
    expect(ids).toEqual([publicDeckId]);
  });

  it("AC-3: honours the isPublic filter, and an anonymous caller owns no private decks", async () => {
    const onlyPublic = await request(app.getHttpServer()).get(
      "/flashcard/decks?isPublic=true"
    );
    expect(onlyPublic.status).toBe(200);
    expect(onlyPublic.body.map((deck: { id: string }) => deck.id)).toEqual([
      publicDeckId,
    ]);

    const onlyPrivate = await request(app.getHttpServer()).get(
      "/flashcard/decks?isPublic=false"
    );
    expect(onlyPrivate.status).toBe(200);
    expect(onlyPrivate.body).toEqual([]);
  });

  describe("AC-4: every write is a 401 with no token, and nothing moves", () => {
    it("PUT", async () => {
      const response = await request(app.getHttpServer())
        .put(`/flashcard/decks/${publicDeckId}`)
        .send({ title: "Hijacked" });
      expect(response.status).toBe(401);
    });

    it("PATCH", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/flashcard/decks/${publicDeckId}`)
        .send({ title: "Hijacked" });
      expect(response.status).toBe(401);
    });

    it("DELETE", async () => {
      const response = await request(app.getHttpServer()).delete(
        `/flashcard/decks/${publicDeckId}`
      );
      expect(response.status).toBe(401);
    });

    it("POST a deck", async () => {
      const response = await request(app.getHttpServer())
        .post("/flashcard/decks")
        .send({ title: "Anonymous deck" });
      expect(response.status).toBe(401);
    });

    it("POST to a collection, and GET the collection list", async () => {
      const collect = await request(app.getHttpServer()).post(
        `/flashcard/decks/${publicDeckId}/collections`
      );
      expect(collect.status).toBe(401);

      const collections = await request(app.getHttpServer()).get(
        "/flashcard/decks/collections"
      );
      expect(collections.status).toBe(401);
    });

    afterEach(async () => {
      // Read back as the owner, not anonymously: the owner's view is the one
      // that would show a write that got through.
      const response = await request(app.getHttpServer())
        .get(`/flashcard/decks/${publicDeckId}`)
        .set("Authorization", owner());
      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Owner's Public Deck");

      const decks = await request(app.getHttpServer())
        .get("/flashcard/decks")
        .set("Authorization", owner());
      expect(decks.body).toHaveLength(2);
    });
  });

  describe("AC-5: a token that is present but invalid is a 401, never anonymous", () => {
    const invalidHeaders: [string, () => string][] = [
      [
        "an expired token",
        () => bearerFor({ sub: TEST_USER_ID, expiresInSeconds: -3600 }),
      ],
      [
        "a token signed by a key the realm does not know",
        () => bearerFor({ sub: TEST_USER_ID, header: { kid: "unknown-kid" } }),
      ],
      [
        "a token with a tampered signature",
        () => {
          const token = mintTestToken({ sub: TEST_USER_ID });
          const [header, payload] = token.split(".");
          return `Bearer ${header}.${payload}.${Buffer.from("forged").toString("base64url")}`;
        },
      ],
      ["a string that is not a JWT", () => "Bearer not-a-jwt"],
      ["a non-Bearer scheme", () => "Basic dXNlcjpwYXNz"],
      ["Bearer with no token", () => "Bearer"],
    ];

    for (const [label, header] of invalidHeaders) {
      it(`${label} — on the single-deck read`, async () => {
        const response = await request(app.getHttpServer())
          .get(`/flashcard/decks/${publicDeckId}`)
          .set("Authorization", header());
        expect(response.status).toBe(401);
      });

      it(`${label} — on the list`, async () => {
        const response = await request(app.getHttpServer())
          .get("/flashcard/decks")
          .set("Authorization", header());
        expect(response.status).toBe(401);
      });
    }
  });

  describe("a valid token on the same routes is decided as before", () => {
    it("lets the author read their own private deck", async () => {
      const response = await request(app.getHttpServer())
        .get(`/flashcard/decks/${privateDeckId}`)
        .set("Authorization", owner());
      expect(response.status).toBe(200);
    });

    it("lists the author's private deck alongside the public one", async () => {
      const response = await request(app.getHttpServer())
        .get("/flashcard/decks")
        .set("Authorization", owner());
      expect(response.status).toBe(200);
      expect(
        response.body.map((deck: { id: string }) => deck.id).sort()
      ).toEqual([publicDeckId, privateDeckId].sort());
    });

    it("answers a stranger's read of the private deck with 404, as MDRS-43 does", async () => {
      const response = await request(app.getHttpServer())
        .get(`/flashcard/decks/${privateDeckId}`)
        .set("Authorization", stranger());
      expect(response.status).toBe(404);
      expect(response.body.code).toBe(DECK_NOT_FOUND);
    });

    it("refuses a stranger's write to the public deck with 403", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/flashcard/decks/${publicDeckId}`)
        .set("Authorization", stranger())
        .send({ title: "Hijacked" });
      expect(response.status).toBe(403);
    });
  });

  it("keeps /health open with no token", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
  });
});
