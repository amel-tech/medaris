import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { flashcards } from "../../src/database/schema/flashcard.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { permissionGrants } from "../../src/database/schema/permission.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
} from "../../src/database/schema/role-assignment.schema";
import { SCOPE_TYPES } from "../../src/database/schema/scope-type.schema";
import { DeckPublishStatus } from "../../src/flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { FlashcardDeckRepository } from "../../src/flashcard/flashcard-deck.repository";
import { createTestApp } from "../helpers/test-app.helper";
import { TestDatabaseUtils } from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-148: a deck becomes public only when the başnazım, or a Medaris nazımı
 * holding `platform.deck_publish`, answers the owner's request; only the
 * başnazım takes a published deck back, with a reason the owner reads. Real
 * guard, real Postgres.
 */
const ADMIN_ID = "f2000000-0000-4000-8000-000000000001";
const OWNER_ID = "f2000000-0000-4000-8000-000000000002";
const STRANGER_ID = "f2000000-0000-4000-8000-000000000003";
const HOLDER_ID = "f2000000-0000-4000-8000-000000000004";
const BARE_ID = "f2000000-0000-4000-8000-000000000005";
const REVOKED_ID = "f2000000-0000-4000-8000-000000000006";
const EXPIRED_ID = "f2000000-0000-4000-8000-000000000007";
const NO_ROLE_ID = "f2000000-0000-4000-8000-000000000008";

const auth = (sub: string) =>
  bearerFor({
    sub,
    claims:
      sub === ADMIN_ID ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } } : {},
  });

describe("Deck publication (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;

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
    "notifications",
  ] as const;

  /** A deck with two cards, in the given state, written straight to the table. */
  const seedDeck = async (
    values: Partial<typeof decks.$inferInsert> = {}
  ): Promise<string> => {
    const [{ id }] = await db()
      .insert(decks)
      .values({ authorId: OWNER_ID, title: "Mehmûz fiiller", ...values })
      .returning({ id: decks.id });
    await db()
      .insert(flashcards)
      .values(
        [1, 2].map((n) => ({
          deckId: id,
          authorId: OWNER_ID,
          type: FlashcardType.VOCABULARY,
          contentFront: `ön ${n}`,
          contentBack: `arka ${n}`,
        }))
      );
    return id;
  };
  const pendingDeck = () =>
    seedDeck({
      publishStatus: DeckPublishStatus.PENDING,
      publishRequestedAt: new Date(),
    });
  const publishedDeck = () =>
    seedDeck({
      isPublic: true,
      publishStatus: DeckPublishStatus.PUBLISHED,
      publishDecidedAt: new Date(),
      publishDecidedBy: ADMIN_ID,
    });
  const rowOf = async (id: string) =>
    (await db().select().from(decks).where(eq(decks.id, id)))[0];
  const rowsOf = (action: string) =>
    db().select().from(auditLog).where(eq(auditLog.action, action));

  const codeOf = (res: request.Response) =>
    res.body.code ?? res.body.error?.code;

  /** Rows where the two columns of one fact disagree; none may ever exist. */
  const splitRows = async () =>
    (
      await db().execute(
        sql`select id from decks where is_public <> (publish_status::text = 'PUBLISHED')`
      )
    ).rows;

  /** The Medaris nazımı role row, and optionally the deck-publish grant. */
  const makeMedarisNazim = async (
    userId: string,
    grant?: Partial<typeof permissionGrants.$inferInsert>
  ) => {
    await db().insert(roleAssignments).values({
      userId,
      role: ASSIGNED_ROLES.MEDARIS_NAZIM,
      scopeType: SCOPE_TYPES.PLATFORM,
      scopeId: null,
      grantedBy: ADMIN_ID,
    });
    if (grant) await giveGrant(userId, grant);
  };
  const giveGrant = async (
    userId: string,
    extra: Partial<typeof permissionGrants.$inferInsert> = {}
  ) => {
    await db()
      .insert(permissionGrants)
      .values({
        userId,
        scopeType: SCOPE_TYPES.PLATFORM,
        scopeId: null,
        permission: "platform.deck_publish",
        grantedBy: ADMIN_ID,
        ...extra,
      });
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  it("asks, stays private, is published by the başnazım, and goes private again at once when the owner says so", async () => {
    const created = await http()
      .post("/flashcard/decks")
      .set("Authorization", auth(OWNER_ID))
      .send({ title: "Mehmûz fiiller" })
      .expect(201);
    const id: string = created.body.id;
    expect(created.body).toMatchObject({
      isPublic: false,
      publishStatus: DeckPublishStatus.PRIVATE,
    });
    await db().insert(flashcards).values({
      deckId: id,
      authorId: OWNER_ID,
      type: FlashcardType.VOCABULARY,
      contentFront: "ön yüz",
      contentBack: "arka yüz",
    });

    const anonymousReads = async () => {
      const listed = await http().get("/flashcard/decks").expect(200);
      return {
        deck: (await http().get(`/flashcard/decks/${id}`)).status,
        cards: (await http().get(`/flashcard/cards?deckId=${id}`)).status,
        listed: (listed.body as { id: string }[]).some((d) => d.id === id),
      };
    };

    await http()
      .post(`/flashcard/decks/${id}/publish-request`)
      .set("Authorization", auth(OWNER_ID))
      .expect(201);
    expect(await anonymousReads()).toEqual({
      deck: 404,
      cards: 404,
      listed: false,
    });

    await http()
      .post(`/nizam/deck-publish-requests/${id}/approve`)
      .set("Authorization", auth(ADMIN_ID))
      .expect(204);
    expect(await anonymousReads()).toEqual({
      deck: 200,
      cards: 200,
      listed: true,
    });

    await http()
      .delete(`/flashcard/decks/${id}/publish-request`)
      .set("Authorization", auth(OWNER_ID))
      .expect(200);
    expect(await anonymousReads()).toEqual({
      deck: 404,
      cards: 404,
      listed: false,
    });
    // The last answer goes with the visibility: the approval above must not
    // outlive the deck's publication.
    expect(await rowOf(id)).toMatchObject({
      publishRequestedAt: null,
      publishDecidedAt: null,
      publishDecidedBy: null,
      publishRejectReason: null,
    });

    // `is_public` and `publish_status` are one fact written twice.
    const drifted = await db().execute(
      sql`select count(*)::int as n from decks where is_public <> (publish_status = 'PUBLISHED')`
    );
    expect(drifted.rows[0].n).toBe(0);
    expect(await splitRows()).toHaveLength(0);
  });

  describe("an owner cannot publish by himself", () => {
    it.each([
      true,
      false,
    ])("answers 400 to a body sending isPublic %s on POST, PUT and PATCH, and the deck does not move", async (isPublic) => {
      const id = await seedDeck();
      const before = await rowOf(id);

      await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(OWNER_ID))
        .send({ title: "Yeni deste", isPublic })
        .expect(400);
      await http()
        .put(`/flashcard/decks/${id}`)
        .set("Authorization", auth(OWNER_ID))
        .send({ title: "Başka ad", isPublic })
        .expect(400);
      await http()
        .patch(`/flashcard/decks/${id}`)
        .set("Authorization", auth(OWNER_ID))
        .send({ isPublic })
        .expect(400);

      expect(await rowOf(id)).toEqual(before);
      expect(await db().select().from(decks)).toHaveLength(1);
    });

    it("still edits the title, and the deck stays private", async () => {
      const id = await seedDeck();
      const res = await http()
        .patch(`/flashcard/decks/${id}`)
        .set("Authorization", auth(OWNER_ID))
        .send({ title: "Başka ad" })
        .expect(200);
      expect(res.body).toMatchObject({
        title: "Başka ad",
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
      });
    });
  });

  describe("who may answer a request", () => {
    it("refuses a Medaris nazımı without the permission: list, cards, approve, reject", async () => {
      await makeMedarisNazim(BARE_ID);
      const id = await pendingDeck();
      const as = (r: request.Test) => r.set("Authorization", auth(BARE_ID));

      await as(http().get("/nizam/deck-publish-requests")).expect(403);
      await as(http().get(`/nizam/deck-publish-requests/${id}/cards`)).expect(
        403
      );
      await as(
        http().post(`/nizam/deck-publish-requests/${id}/approve`)
      ).expect(403);
      await as(
        http()
          .post(`/nizam/deck-publish-requests/${id}/reject`)
          .send({ reason: "Kaynak yok." })
      ).expect(403);

      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PENDING);
      expect(await db().select().from(notifications)).toHaveLength(0);
      expect(await rowsOf("deck.private-read")).toHaveLength(0);
    });

    it("lets the holder list, read the cards on the record, and approve", async () => {
      await makeMedarisNazim(HOLDER_ID, {});
      const id = await pendingDeck();
      const as = (r: request.Test) => r.set("Authorization", auth(HOLDER_ID));

      const list = await as(http().get("/nizam/deck-publish-requests")).expect(
        200
      );
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([id]);

      await as(
        http().get(`/nizam/deck-publish-requests/${id}/cards?all=true`)
      ).expect(200);
      const reads = await rowsOf("deck.private-read");
      expect(reads).toHaveLength(1);
      expect(reads[0]).toMatchObject({ actorId: HOLDER_ID, entityId: id });

      await as(
        http().post(`/nizam/deck-publish-requests/${id}/approve`)
      ).expect(204);
      expect(await rowOf(id)).toMatchObject({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
        publishDecidedBy: HOLDER_ID,
      });
    });

    it("lets the holder refuse a request, with a reason", async () => {
      await makeMedarisNazim(HOLDER_ID, {});
      const id = await pendingDeck();
      await http()
        .post(`/nizam/deck-publish-requests/${id}/reject`)
        .set("Authorization", auth(HOLDER_ID))
        .send({ reason: "Kaynak yok." })
        .expect(204);
      expect(await rowOf(id)).toMatchObject({
        isPublic: false,
        publishStatus: DeckPublishStatus.REJECTED,
      });
    });

    it("counts a revoked grant and an expired one for nothing", async () => {
      await makeMedarisNazim(REVOKED_ID, {
        revokedAt: new Date(),
        revokedBy: ADMIN_ID,
      });
      await makeMedarisNazim(EXPIRED_ID, {
        expiresAt: new Date(Date.now() - 60_000),
      });
      const id = await pendingDeck();
      for (const sub of [REVOKED_ID, EXPIRED_ID]) {
        await http()
          .post(`/nizam/deck-publish-requests/${id}/approve`)
          .set("Authorization", auth(sub))
          .expect(403);
      }
      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PENDING);
    });

    it("counts a grant without the Medaris nazımı role for nothing", async () => {
      await giveGrant(NO_ROLE_ID);
      const id = await pendingDeck();
      await http()
        .post(`/nizam/deck-publish-requests/${id}/approve`)
        .set("Authorization", auth(NO_ROLE_ID))
        .expect(403);
      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PENDING);
    });

    it("does not let the owner answer his own request", async () => {
      const id = await pendingDeck();
      await http()
        .post(`/nizam/deck-publish-requests/${id}/approve`)
        .set("Authorization", auth(OWNER_ID))
        .expect(403);
      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PENDING);
    });
  });

  describe("unpublishing", () => {
    const unpublish = (id: string, sub: string, body?: object) =>
      http()
        .post(`/nizam/deck-publish-requests/${id}/unpublish`)
        .set("Authorization", auth(sub))
        .send(body ?? { reason: "Kaynak gösterilmemiş." });
    it("takes the deck back to private, tells the owner the reason, and leaves one audit row", async () => {
      const id = await publishedDeck();

      await unpublish(id, ADMIN_ID, {
        reason: "  Kaynak gösterilmemiş. ",
      }).expect(204);

      expect(await rowOf(id)).toMatchObject({
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
        publishRequestedAt: null,
        publishDecidedAt: null,
        publishDecidedBy: null,
        publishRejectReason: null,
      });
      expect((await http().get(`/flashcard/decks/${id}`)).status).toBe(404);
      expect((await http().get(`/flashcard/cards?deckId=${id}`)).status).toBe(
        404
      );

      const told = await db().select().from(notifications);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        userId: OWNER_ID,
        type: "DECK_PUBLISH_RESULT",
        targetId: id,
        params: {
          outcome: "unpublished",
          deckTitle: "Mehmûz fiiller",
          reason: "Kaynak gösterilmemiş.",
        },
      });

      const rows = await rowsOf("deck.unpublish");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorId: ADMIN_ID,
        entity: "deck",
        entityId: id,
        details: {
          title: "Mehmûz fiiller",
          owner: OWNER_ID,
          reason: "Kaynak gösterilmemiş.",
        },
      });
    });

    it("lets the owner ask again, and the cards survive", async () => {
      const id = await publishedDeck();
      await unpublish(id, ADMIN_ID).expect(204);
      await http()
        .post(`/flashcard/decks/${id}/publish-request`)
        .set("Authorization", auth(OWNER_ID))
        .expect(201);
      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PENDING);
      expect(
        await db().select().from(flashcards).where(eq(flashcards.deckId, id))
      ).toHaveLength(2);
    });

    it("needs a reason: missing, blank or empty is a 400 and the deck stays published", async () => {
      const id = await publishedDeck();
      await unpublish(id, ADMIN_ID, {}).expect(400);
      await unpublish(id, ADMIN_ID, { reason: "   " }).expect(400);
      await unpublish(id, ADMIN_ID, { reason: "" }).expect(400);
      expect((await rowOf(id)).publishStatus).toBe(DeckPublishStatus.PUBLISHED);
      expect(await rowsOf("deck.unpublish")).toHaveLength(0);
      expect(await db().select().from(notifications)).toHaveLength(0);
    });

    it("answers 409 DECK_NOT_PUBLISHED the second time, with no second row and no second notice", async () => {
      const id = await publishedDeck();
      await unpublish(id, ADMIN_ID).expect(204);
      const again = await unpublish(id, ADMIN_ID).expect(409);
      expect(codeOf(again)).toBe("DECK_NOT_PUBLISHED");
      expect(await rowsOf("deck.unpublish")).toHaveLength(1);
      expect(await db().select().from(notifications)).toHaveLength(1);
    });

    it("answers 409 for a private, a waiting and a refused deck, and changes nothing", async () => {
      for (const publishStatus of [
        DeckPublishStatus.PRIVATE,
        DeckPublishStatus.PENDING,
        DeckPublishStatus.REJECTED,
      ]) {
        const id = await seedDeck({ publishStatus });
        const res = await unpublish(id, ADMIN_ID).expect(409);
        expect(codeOf(res)).toBe("DECK_NOT_PUBLISHED");
        expect((await rowOf(id)).publishStatus).toBe(publishStatus);
      }
      expect(await rowsOf("deck.unpublish")).toHaveLength(0);
    });

    it("takes a hidden deck back too, as hiding does not make a deck private, and answers 404 for one that is not there", async () => {
      const hidden = await seedDeck({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
        archivedAt: new Date(),
      });
      expect((await http().get(`/flashcard/decks/${hidden}`)).status).toBe(200);
      await unpublish(hidden, ADMIN_ID).expect(204);
      expect(await rowOf(hidden)).toMatchObject({
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
      });
      expect((await http().get(`/flashcard/decks/${hidden}`)).status).toBe(404);
      expect(await rowsOf("deck.unpublish")).toHaveLength(1);
      await unpublish("f2000000-0000-4000-8000-0000000000ff", ADMIN_ID).expect(
        404
      );
    });

    it("is the başnazım's alone: the owner, a stranger and a nazım holding platform.deck_publish get 403", async () => {
      await makeMedarisNazim(HOLDER_ID, {});
      const id = await publishedDeck();
      for (const sub of [OWNER_ID, STRANGER_ID, HOLDER_ID]) {
        await unpublish(id, sub).expect(403);
      }
      await http()
        .post(`/nizam/deck-publish-requests/${id}/unpublish`)
        .send({ reason: "Sebep." })
        .expect(401);
      expect(await rowOf(id)).toMatchObject({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
      });
      expect(await rowsOf("deck.unpublish")).toHaveLength(0);
      expect(await db().select().from(notifications)).toHaveLength(0);
    });
  });

  describe("the owner's write against a stale read (MDRS-148)", () => {
    /**
     * The service reads the status, then writes: the başnazım's answer can land
     * between the two. The stale read is staged by making `findById` answer
     * what the deck was, while the row already holds what the başnazım made it.
     */
    const staleRead = (was: DeckPublishStatus) => {
      const repo = app.get(FlashcardDeckRepository);
      const real = repo.findById.bind(repo);
      vi.spyOn(repo, "findById").mockImplementationOnce(async (...args) => {
        const found = await real(...args);
        if (found === null) throw new Error("the staged deck is not there");
        return { ...found, publishStatus: was };
      });
    };

    afterEach(() => vi.restoreAllMocks());

    it("does not take a request back that the başnazım has approved meanwhile", async () => {
      const id = await publishedDeck();
      staleRead(DeckPublishStatus.PENDING);
      const res = await http()
        .delete(`/flashcard/decks/${id}/publish-request`)
        .set("Authorization", auth(OWNER_ID))
        .expect(409);
      expect(codeOf(res)).toBe("DECK_PUBLISH_STATE_CONFLICT");
      expect(await rowOf(id)).toMatchObject({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
      });
      expect(await splitRows()).toHaveLength(0);
    });

    it("does not take a request back that the başnazım has refused meanwhile", async () => {
      const id = await seedDeck({
        publishStatus: DeckPublishStatus.REJECTED,
        publishRejectReason: "Eksik.",
        publishDecidedBy: ADMIN_ID,
        publishDecidedAt: new Date(),
      });
      staleRead(DeckPublishStatus.PENDING);
      await http()
        .delete(`/flashcard/decks/${id}/publish-request`)
        .set("Authorization", auth(OWNER_ID))
        .expect(409);
      expect(await rowOf(id)).toMatchObject({
        publishStatus: DeckPublishStatus.REJECTED,
        publishRejectReason: "Eksik.",
      });
    });

    it("does not ask for a deck that is published meanwhile", async () => {
      const id = await publishedDeck();
      staleRead(DeckPublishStatus.PRIVATE);
      await http()
        .post(`/flashcard/decks/${id}/publish-request`)
        .set("Authorization", auth(OWNER_ID))
        .expect(409);
      expect(await rowOf(id)).toMatchObject({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
      });
      expect(await splitRows()).toHaveLength(0);
    });
  });
});
