import { ROLES } from "@medaris/common";
import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import { auditLog } from "../../src/database/schema/audit.schema";
import { courses } from "../../src/database/schema/course.schema";
import { deckProposals } from "../../src/database/schema/deck-proposal.schema";
import { flashcards } from "../../src/database/schema/flashcard.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { notifications } from "../../src/database/schema/notification.schema";
import { ASSIGNED_ROLES } from "../../src/database/schema/role-assignment.schema";
import { users } from "../../src/database/schema/user.schema";
import { DeckPublishStatus } from "../../src/flashcard/domain/deck-publish-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  assignRole,
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-180: the deck screens of the nizam, against a real Postgres. nizam/16
 * (the başnazım answers publish requests), nizam/30 and nizam/35 (a köşk
 * nazımı's decks, the proposals and Gizle).
 */
const ADMIN_ID = "d0000000-0000-4000-8000-000000000001";
const NAZIM_A_ID = "d0000000-0000-4000-8000-000000000002";
const NAZIM_B_ID = "d0000000-0000-4000-8000-000000000003";
const MUDERRIS_ID = "d0000000-0000-4000-8000-000000000004";
const OWNER_ID = "d0000000-0000-4000-8000-000000000005";
const STRANGER_ID = "d0000000-0000-4000-8000-000000000006";

// Every request syncs the caller's profile from the token (MDRS-104), so a
// name seeded in `users` only survives if the token carries it too.
const auth = (sub: string) =>
  bearerFor({
    sub,
    claims: {
      ...(sub === MUDERRIS_ID
        ? { given_name: "Ayşe Nur", family_name: "Kılıçarslan" }
        : {}),
      ...(sub === ADMIN_ID
        ? { realm_access: { roles: [ROLES.SYSTEM_ADMIN] } }
        : {}),
    },
  });

describe("Deck review (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  let koskA: string;
  let koskB: string;
  let courseA: string;
  let pendingDeck: string;
  let decidedDeck: string;

  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;
  const TABLES = [
    ...COURSE_TREE_TABLES,
    "audit_log",
    "notifications",
    "users",
  ] as const;

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    await db().delete(deckProposals);
    await db().delete(flashcards);
    await db().delete(decks);

    await db()
      .insert(users)
      .values([
        { id: OWNER_ID, givenName: "Zeynep Betül", familyName: "Karahanlı" },
        { id: MUDERRIS_ID, givenName: "Ayşe Nur", familyName: "Kılıçarslan" },
      ]);
    [{ id: koskA }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_A_ID, name: "Nûruosmaniye Köşkü" })
      .returning({ id: kosks.id });
    [{ id: koskB }] = await db()
      .insert(kosks)
      .values({ ownerId: NAZIM_B_ID, name: "Fatih Köşkü" })
      .returning({ id: kosks.id });
    await assignRole(db(), {
      userId: NAZIM_A_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskA,
    });
    await assignRole(db(), {
      userId: NAZIM_B_ID,
      role: ASSIGNED_ROLES.KOSK_NAZIM,
      scopeId: koskB,
    });
    [{ id: courseA }] = await db()
      .insert(courses)
      .values({
        koskId: koskA,
        authorId: NAZIM_A_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning({ id: courses.id });
    await assignRole(db(), {
      userId: MUDERRIS_ID,
      role: ASSIGNED_ROLES.MUDERRIS,
      scopeId: courseA,
    });

    [{ id: pendingDeck }] = await db()
      .insert(decks)
      .values({
        authorId: OWNER_ID,
        title: "Mehmûz fiiller",
        description: "Hemzeli fiillerin çekimleri.",
        publishStatus: DeckPublishStatus.PENDING,
        publishRequestedAt: new Date("2026-09-29T21:10:00Z"),
      })
      .returning({ id: decks.id });
    await db()
      .insert(flashcards)
      .values(
        [1, 2, 3, 4, 5].map((n) => ({
          deckId: pendingDeck,
          authorId: OWNER_ID,
          type: FlashcardType.VOCABULARY,
          contentFront: `ön ${n}`,
          contentBack: `arka ${n}`,
          createdAt: new Date(2026, 8, 1, 10, n),
        }))
      );
    [{ id: decidedDeck }] = await db()
      .insert(decks)
      .values({
        authorId: OWNER_ID,
        title: "Avâmil ezberi",
        publishStatus: DeckPublishStatus.REJECTED,
        publishDecidedAt: new Date("2026-09-30T10:00:00Z"),
        publishDecidedBy: ADMIN_ID,
        publishRejectReason: "Kaynak yok.",
      })
      .returning({ id: decks.id });
  });

  afterAll(async () => {
    await app.close();
  });

  describe("publish requests (nizam/16)", () => {
    it("lists the waiting and the answered with both counts", async () => {
      const waiting = await http()
        .get("/nizam/deck-publish-requests")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(waiting.body.pendingCount).toBe(1);
      expect(waiting.body.decidedCount).toBe(1);
      expect(waiting.body.items).toHaveLength(1);
      expect(waiting.body.items[0]).toMatchObject({
        id: pendingDeck,
        title: "Mehmûz fiiller",
        cardCount: 5,
        outcome: "PENDING",
        owner: { id: OWNER_ID, name: "Zeynep Betül Karahanlı" },
      });

      const answered = await http()
        .get("/nizam/deck-publish-requests?status=DECIDED")
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(answered.body.items).toHaveLength(1);
      expect(answered.body.items[0]).toMatchObject({
        id: decidedDeck,
        outcome: "REJECTED",
        rejectReason: "Kaynak yok.",
      });
    });

    it("refuses everyone but the başnazım", async () => {
      await http()
        .get("/nizam/deck-publish-requests")
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(403);
      await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/approve`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(403);
      await http().get("/nizam/deck-publish-requests").expect(401);
    });

    it("writes an audit row for the sample and for every card", async () => {
      const sample = await http()
        .get(`/nizam/deck-publish-requests/${pendingDeck}/cards`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(sample.body.items).toHaveLength(3);
      expect(sample.body.total).toBe(5);
      expect(sample.body.items[0].front).toBe("ön 1");

      const all = await http()
        .get(`/nizam/deck-publish-requests/${pendingDeck}/cards?all=true`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
      expect(all.body.items).toHaveLength(5);

      const rows = await db()
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, pendingDeck));
      expect(rows.map((r) => r.action)).toEqual([
        "deck.private-read",
        "deck.private-read",
      ]);
      expect(
        rows.map((r) => (r.details as { scope: string }).scope).sort()
      ).toEqual(["all", "sample"]);
      expect(rows.every((r) => r.actorId === ADMIN_ID)).toBe(true);
    });

    it("keeps a private deck with no request unreadable", async () => {
      const [{ id }] = await db()
        .insert(decks)
        .values({ authorId: OWNER_ID, title: "Özel" })
        .returning({ id: decks.id });
      await http()
        .get(`/nizam/deck-publish-requests/${id}/cards`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
      expect(await db().select().from(auditLog)).toHaveLength(0);
    });

    it("publishes: the deck turns public, the owner is told, a second answer is 409", async () => {
      await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/approve`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(204);
      const [deck] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, pendingDeck));
      expect(deck).toMatchObject({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
        publishDecidedBy: ADMIN_ID,
      });

      // The anonymous list now carries it.
      const open = await http().get("/flashcard/decks").expect(200);
      expect((open.body as { id: string }[]).map((d) => d.id)).toContain(
        pendingDeck
      );

      const told = await db().select().from(notifications);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        userId: OWNER_ID,
        type: "DECK_PUBLISH_RESULT",
        params: { outcome: "approved", deckTitle: "Mehmûz fiiller" },
      });

      const again = await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/approve`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(409);
      expect(again.body.code).toBe("DECK_REQUEST_NOT_PENDING");
    });

    it("refuses only with a reason, keeps the deck private and tells the owner", async () => {
      await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "   " })
        .expect(400);
      await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({})
        .expect(400);

      await http()
        .post(`/nizam/deck-publish-requests/${pendingDeck}/reject`)
        .set("Authorization", auth(ADMIN_ID))
        .send({ reason: "Kartlarda kaynak yok." })
        .expect(204);
      const [deck] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, pendingDeck));
      expect(deck).toMatchObject({
        isPublic: false,
        publishStatus: DeckPublishStatus.REJECTED,
        publishRejectReason: "Kartlarda kaynak yok.",
      });
      const [told] = await db().select().from(notifications);
      expect(told.params).toMatchObject({
        outcome: "rejected",
        reason: "Kartlarda kaynak yok.",
      });
    });

    it("lets a refused deck ask again", async () => {
      await http()
        .post(`/flashcard/decks/${decidedDeck}/publish-request`)
        .set("Authorization", auth(OWNER_ID))
        .expect(201);
      const [deck] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, decidedDeck));
      expect(deck.publishStatus).toBe(DeckPublishStatus.PENDING);
      expect(deck.publishRejectReason).toBeNull();
    });
  });

  describe("köşk decks and proposals (nizam/30, 35)", () => {
    const propose = (sub: string, body: object = {}) =>
      http()
        .post(`/kosks/${koskA}/deck-proposals`)
        .set("Authorization", auth(sub))
        .send({ title: "İ'lâl kaideleri", cardType: "VOCABULARY", ...body });

    it("lists the köşk's decks and its waiting proposals for its nazım only", async () => {
      await propose(MUDERRIS_ID, {
        description: "Tek deste iki derse yeter.",
      }).expect(201);
      await db().insert(decks).values({
        authorId: NAZIM_A_ID,
        koskId: koskA,
        title: "Sarfın temel kelimeleri",
      });
      // Another köşk's deck stays out.
      await db().insert(decks).values({
        authorId: NAZIM_B_ID,
        koskId: koskB,
        title: "Fatih destesi",
      });

      const res = await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(res.body.decks.map((d: { title: string }) => d.title)).toEqual([
        "Sarfın temel kelimeleri",
      ]);
      expect(res.body.proposals).toHaveLength(1);
      expect(res.body.proposals[0]).toMatchObject({
        title: "İ'lâl kaideleri",
        courseTitle: "Emsile ve Bina",
        proposedBy: { id: MUDERRIS_ID, name: "Ayşe Nur Kılıçarslan" },
      });

      await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(NAZIM_B_ID))
        .expect(403);
      await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(200);
    });

    it("lets only a müderris of the köşk propose", async () => {
      await propose(STRANGER_ID).expect(403);
      await propose(NAZIM_B_ID).expect(403);
      await propose(MUDERRIS_ID, { title: "  " }).expect(400);
      await propose(MUDERRIS_ID, { cardType: "x" }).expect(400);
    });

    it("opens a deck from a proposal and accepts it in the same step", async () => {
      const proposed = await propose(MUDERRIS_ID).expect(201);
      const res = await http()
        .post(`/kosks/${koskA}/decks`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({
          title: "İ'lâl kaideleri",
          cardType: "HADEETH",
          proposalId: proposed.body.id,
        })
        .expect(201);
      const [deck] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, res.body.id));
      expect(deck).toMatchObject({
        koskId: koskA,
        cardType: FlashcardType.HADEETH,
        isPublic: false,
      });
      const [proposal] = await db().select().from(deckProposals);
      expect(proposal).toMatchObject({
        status: "ACCEPTED",
        deckId: res.body.id,
        decidedBy: NAZIM_A_ID,
      });

      const list = await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(list.body.proposals).toHaveLength(0);
      expect(list.body.decks).toHaveLength(1);

      // A proposal answered once cannot open a second deck.
      const again = await http()
        .post(`/kosks/${koskA}/decks`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({
          title: "Yine",
          cardType: "VOCABULARY",
          proposalId: proposed.body.id,
        })
        .expect(409);
      expect(again.body.code).toBe("DECK_PROPOSAL_NOT_PENDING");
      expect(
        await db().select().from(decks).where(eq(decks.title, "Yine"))
      ).toHaveLength(0);
    });

    it("opens a deck from scratch, and refuses an empty title or a stranger", async () => {
      await http()
        .post(`/kosks/${koskA}/decks`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ title: "", cardType: "VOCABULARY" })
        .expect(400);
      await http()
        .post(`/kosks/${koskA}/decks`)
        .set("Authorization", auth(NAZIM_B_ID))
        .send({ title: "Yeni", cardType: "VOCABULARY" })
        .expect(403);
      await http()
        .post(`/kosks/${koskA}/decks`)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ title: "Yeni", cardType: "VOCABULARY" })
        .expect(201);
    });

    it("refuses a proposal with a reason and tells the proposer", async () => {
      const proposed = await propose(MUDERRIS_ID).expect(201);
      const path = `/kosks/${koskA}/deck-proposals/${proposed.body.id}/reject`;
      await http()
        .post(path)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: " " })
        .expect(400);
      await http()
        .post(path)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: "Bu konu zaten bir destede var." })
        .expect(204);
      const [proposal] = await db().select().from(deckProposals);
      expect(proposal).toMatchObject({
        status: "REJECTED",
        rejectReason: "Bu konu zaten bir destede var.",
      });
      const [told] = await db().select().from(notifications);
      expect(told).toMatchObject({ userId: MUDERRIS_ID });
      expect(told.params).toMatchObject({
        outcome: "proposal_rejected",
        reason: "Bu konu zaten bir destede var.",
      });
      await http()
        .post(path)
        .set("Authorization", auth(NAZIM_A_ID))
        .send({ reason: "Yine" })
        .expect(409);
    });

    it("hides a köşk deck into the köşk's archive and brings it back", async () => {
      const [{ id }] = await db()
        .insert(decks)
        .values({ authorId: NAZIM_A_ID, koskId: koskA, title: "Gizlenecek" })
        .returning({ id: decks.id });
      await http()
        .post(`/decks/${id}/hide`)
        .set("Authorization", auth(NAZIM_B_ID))
        .expect(403);
      await http()
        .post(`/decks/${id}/hide`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(204);

      const list = await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(list.body.decks).toHaveLength(0);

      const archive = await http()
        .get(`/kosks/${koskA}/archive?type=deck`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(archive.body.items.map((i: { id: string }) => i.id)).toEqual([id]);

      await http()
        .post(`/decks/${id}/hide`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(404);
      await http()
        .post(`/archive/deck/${id}/restore`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      const back = await http()
        .get(`/kosks/${koskA}/decks/manage`)
        .set("Authorization", auth(NAZIM_A_ID))
        .expect(200);
      expect(back.body.decks).toHaveLength(1);
    });

    it("does not hide a personal deck", async () => {
      await http()
        .post(`/decks/${pendingDeck}/hide`)
        .set("Authorization", auth(ADMIN_ID))
        .expect(404);
    });
  });
});
