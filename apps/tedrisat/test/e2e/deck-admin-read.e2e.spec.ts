import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import {
  flashcardProgress,
  flashcards,
} from "../../src/database/schema/flashcard.schema";
import {
  decks,
  decksUsers,
} from "../../src/database/schema/flashcard-deck.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { SCOPE_TYPES } from "../../src/database/schema/scope-type.schema";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-148: the başnazım reads another person's private deck and its cards,
 * read-only, and every read is on the record. Real guard, real Postgres.
 */
const ADMIN_ID = "f1000000-0000-4000-8000-000000000001";
const OWNER_ID = "f1000000-0000-4000-8000-000000000002";
const STRANGER_ID = "f1000000-0000-4000-8000-000000000003";
const MEDARIS_ID = "f1000000-0000-4000-8000-000000000004";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("The başnazım reads a private deck (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let deckId: string;
  let cardId: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [
    "flashcard_progress",
    "decks_users",
    "flashcards",
    "decks",
    "role_assignments",
    "permission_grants",
    "audit_log",
  ] as const;

  const adminReads = () =>
    db().select().from(auditLog).where(eq(auditLog.action, "deck.admin_read"));
  const everyAuditRow = () => db().select().from(auditLog);
  const deckRow = async () =>
    (await db().select().from(decks).where(eq(decks.id, deckId)))[0];
  const cardRows = () =>
    db().select().from(flashcards).where(eq(flashcards.deckId, deckId));

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    [{ id: deckId }] = await db()
      .insert(decks)
      .values({ authorId: OWNER_ID, title: "Özel deste" })
      .returning({ id: decks.id });
    const cards = await db()
      .insert(flashcards)
      .values(
        [1, 2].map((n) => ({
          deckId,
          authorId: OWNER_ID,
          type: FlashcardType.VOCABULARY,
          contentFront: `ön ${n}`,
          contentBack: `arka ${n}`,
        }))
      )
      .returning({ id: flashcards.id });
    cardId = cards[0].id;
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("reads", () => {
    // Each route is a read the engine lets the başnazım through as `deck.view`.
    const reads: [string, () => string][] = [
      ["GET /flashcard/decks/:id", () => `/flashcard/decks/${deckId}`],
      [
        "GET /flashcard/cards?deckId=",
        () => `/flashcard/cards?deckId=${deckId}`,
      ],
      ["GET /flashcard/cards/:id", () => `/flashcard/cards/${cardId}`],
      ["GET /flashcard/decks/:id/due", () => `/flashcard/decks/${deckId}/due`],
    ];

    it.each(
      reads
    )("%s answers 200 and writes exactly one deck.admin_read row", async (_name, path) => {
      await http().get(path()).set("Authorization", auth(ADMIN_ID)).expect(200);

      const rows = await adminReads();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: ADMIN_ID,
        entityId: deckId,
        details: { authorId: OWNER_ID },
      });
      expect(await everyAuditRow()).toHaveLength(1);
    });

    it("writes one more row for every further read", async () => {
      for (const [, path] of reads) {
        await http()
          .get(path())
          .set("Authorization", auth(ADMIN_ID))
          .expect(200);
      }
      expect(await adminReads()).toHaveLength(reads.length);
    });

    it("leaves the owner's own reads off the record", async () => {
      for (const [, path] of reads) {
        await http()
          .get(path())
          .set("Authorization", auth(OWNER_ID))
          .expect(200);
      }
      expect(await everyAuditRow()).toHaveLength(0);
    });

    it("returns the cards themselves", async () => {
      const res = await http()
        .get(`/flashcard/cards?deckId=${deckId}`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(
        res.body.map((c: { contentFront: string }) => c.contentFront)
      ).toEqual(expect.arrayContaining(["ön 1", "ön 2"]));
    });
  });

  describe("writes", () => {
    const csv = Buffer.from(
      `Card Type,Content Front,Content Back\n${FlashcardType.VOCABULARY},a,b\n`
    );
    const card = {
      type: FlashcardType.VOCABULARY,
      contentFront: "yeni ön",
      contentBack: "yeni arka",
    };

    // Every one answers 403 with nothing written: no audit row (a refused write
    // is not a read), the deck and the cards as they were, no collection row,
    // no progress row.
    const refusals: [string, () => request.Test][] = [
      [
        "PUT /flashcard/decks/:id",
        () =>
          http()
            .put(`/flashcard/decks/${deckId}`)
            .send({ title: "Başka ad 1" }),
      ],
      [
        "PATCH /flashcard/decks/:id",
        () =>
          http()
            .patch(`/flashcard/decks/${deckId}`)
            .send({ title: "Başka ad 2" }),
      ],
      [
        "DELETE /flashcard/decks/:id",
        () => http().delete(`/flashcard/decks/${deckId}`),
      ],
      [
        "POST /flashcard/decks/:id/publish-request",
        () => http().post(`/flashcard/decks/${deckId}/publish-request`),
      ],
      [
        "DELETE /flashcard/decks/:id/publish-request",
        () => http().delete(`/flashcard/decks/${deckId}/publish-request`),
      ],
      [
        "POST /flashcard/decks/:deckId/cards",
        () => http().post(`/flashcard/decks/${deckId}/cards`).send([card]),
      ],
      [
        "POST /flashcard/decks/:deckId/cards/bulk",
        () => http().post(`/flashcard/decks/${deckId}/cards/bulk`).send([card]),
      ],
      [
        "POST /flashcard/decks/:deckId/cards/bulk/import",
        () =>
          http()
            .post(`/flashcard/decks/${deckId}/cards/bulk/import`)
            .attach("file", csv, "cards.csv"),
      ],
      [
        "GET /flashcard/decks/:deckId/cards/bulk/export (export is not covered by the read exception)",
        () =>
          http().get(`/flashcard/decks/${deckId}/cards/bulk/export?format=csv`),
      ],
      [
        "PUT /flashcard/cards/:id",
        () => http().put(`/flashcard/cards/${cardId}`).send(card),
      ],
      [
        "PATCH /flashcard/cards/:id",
        () =>
          http()
            .patch(`/flashcard/cards/${cardId}`)
            .send({ contentFront: "x" }),
      ],
      [
        "DELETE /flashcard/cards/:id",
        () => http().delete(`/flashcard/cards/${cardId}`),
      ],
      [
        "PUT /flashcard/cards/progress",
        () =>
          http()
            .put("/flashcard/cards/progress")
            .send([{ flashcardId: cardId, status: "LEARNING" }]),
      ],
    ];

    it.each(
      refusals
    )("%s answers 403 and changes nothing", async (_name, send) => {
      const deckBefore = await deckRow();
      const cardsBefore = await cardRows();

      const res = await send().set("Authorization", auth(ADMIN_ID));

      expect(res.status).toBe(403);
      expect(await everyAuditRow()).toHaveLength(0);
      expect(await deckRow()).toEqual(deckBefore);
      expect(await cardRows()).toEqual(cardsBefore);
      expect(await db().select().from(decksUsers)).toHaveLength(0);
      expect(await db().select().from(flashcardProgress)).toHaveLength(0);
    });

    // The one route whose guard cannot tell a read from a collect: it asks
    // `deck.view`, so the guard lets the başnazım through and writes its one
    // row, and the handler then refuses. The row stays: it records a request
    // for a private deck that was refused, not a read that happened.
    it("POST /flashcard/decks/:id/collections answers 403 and collects nothing", async () => {
      const res = await http()
        .post(`/flashcard/decks/${deckId}/collections`)
        .set("Authorization", auth(ADMIN_ID));

      expect(res.status).toBe(403);
      expect(await db().select().from(decksUsers)).toHaveLength(0);
      expect(await adminReads()).toHaveLength(1);
    });

    it("still lets the owner collect his own private deck", async () => {
      await http()
        .post(`/flashcard/decks/${deckId}/collections`)
        .set("Authorization", auth(OWNER_ID))
        .expect(201);
      expect(await db().select().from(decksUsers)).toHaveLength(1);
    });
  });

  describe("nobody else is let in", () => {
    const paths = () => [
      `/flashcard/decks/${deckId}`,
      `/flashcard/cards?deckId=${deckId}`,
      `/flashcard/cards/${cardId}`,
      `/flashcard/decks/${deckId}/due`,
    ];

    it("answers a stranger 404 on every read route, with no row", async () => {
      for (const path of paths()) {
        await http()
          .get(path)
          .set("Authorization", auth(STRANGER_ID))
          .expect(404);
      }
      expect(await everyAuditRow()).toHaveLength(0);
    });

    it("answers a Medaris nazımı holding platform.deck_publish 404 as well: the nizam preview is his only door", async () => {
      await db().insert(roleAssignments).values({
        userId: MEDARIS_ID,
        role: ASSIGNED_ROLES.MEDARIS_NAZIM,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        grantedBy: ADMIN_ID,
      });
      await db().insert(permissionGrants).values({
        userId: MEDARIS_ID,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.deck_publish",
        grantedBy: ADMIN_ID,
      });
      for (const path of paths()) {
        await http()
          .get(path)
          .set("Authorization", auth(MEDARIS_ID))
          .expect(404);
      }
      expect(await everyAuditRow()).toHaveLength(0);
    });
  });

  describe("what the exception does not take away", () => {
    it("lets the başnazım write to his own private deck", async () => {
      const created = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(ADMIN_ID))
        .send({ title: "Başnazımın destesi" })
        .expect(201);
      await http()
        .patch(`/flashcard/decks/${created.body.id}`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ title: "Yeni adı" })
        .expect(200);
      await http()
        .post(`/flashcard/decks/${created.body.id}/cards`)
        .set("Authorization", auth(ADMIN_ID))
        .send([
          {
            type: FlashcardType.VOCABULARY,
            contentFront: "ön yüz",
            contentBack: "arka yüz",
          },
        ])
        .expect(201);
      expect(await everyAuditRow()).toHaveLength(0);
    });

    it("lets the başnazım record progress on a public deck", async () => {
      await dbUtils.publishDeck(deckId);
      await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(ADMIN_ID))
        .send([{ flashcardId: cardId, status: "LEARNING" }])
        .expect(200);
      expect(await db().select().from(flashcardProgress)).toHaveLength(1);
    });
  });
});
