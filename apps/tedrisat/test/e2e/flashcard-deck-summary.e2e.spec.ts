import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courseMuderris,
  courses,
  enrollments,
} from "../../src/database/schema/course.schema";
import {
  flashcardProgress,
  flashcards,
} from "../../src/database/schema/flashcard.schema";
import {
  decks,
  decksUsers,
} from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import { madrasahs } from "../../src/database/schema/madrasah.schema";
import { DeckPublishStatus } from "../../src/flashcard/domain/deck-publish-status.enum";
import { FlashcardProgressStatus } from "../../src/flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-164: the deck lists (`summary`, `explore`), the publish request, the
 * new deck fields, and the rule that a deck belonging to a course is readable
 * by the talebe enrolled in it and by nobody else. Real guard, no stub.
 */
const AUTHOR_ID = "e1000000-0000-4000-8000-000000000001";
const TALEBE_ID = "e1000000-0000-4000-8000-000000000002";
const STRANGER_ID = "e1000000-0000-4000-8000-000000000003";
const PENDING_ID = "e1000000-0000-4000-8000-000000000004";

const auth = (sub: string) => bearerFor({ sub });

const TABLES = [
  "flashcard_progress",
  "decks_users",
  "flashcards",
  "decks",
  ...COURSE_TREE_TABLES,
  "madrasahs",
  "users",
] as const;

describe("Deck lists, publish request and course decks (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  let koskId: string;
  let courseId: string;
  let madrasahCourseId: string;
  let madrasahId: string;

  const makeDeck = async (values: Partial<typeof decks.$inferInsert>) => {
    const [row] = await db()
      .insert(decks)
      .values({ authorId: AUTHOR_ID, title: "Bir deste", ...values })
      .returning();
    return row;
  };

  const makeCard = async (
    deckId: string,
    front: string,
    extra: Partial<typeof flashcards.$inferInsert> = {}
  ) => {
    const [row] = await db()
      .insert(flashcards)
      .values({
        deckId,
        authorId: AUTHOR_ID,
        type: FlashcardType.VOCABULARY,
        contentFront: front,
        contentBack: `${front} anlamı`,
        ...extra,
      })
      .returning();
    return row;
  };

  beforeAll(async () => {
    app = await createTestApp();
    databaseService = app.get<DatabaseService>(DatabaseService);
    dbUtils = new TestDatabaseUtils(databaseService);
  });

  beforeEach(async () => {
    await dbUtils.cleanTables(...TABLES);
    const [kosk] = await db()
      .insert(kosks)
      .values({ ownerId: AUTHOR_ID, name: "Nûruosmaniye Köşkü" })
      .returning();
    koskId = kosk.id;
    const [madrasah] = await db()
      .insert(madrasahs)
      .values({
        handle: "suleymaniye",
        name: "Süleymaniye Medresesi",
        createdBy: AUTHOR_ID,
      })
      .returning();
    madrasahId = madrasah.id;
    const [course] = await db()
      .insert(courses)
      .values({
        koskId,
        authorId: AUTHOR_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    await db().insert(courseMuderris).values({
      courseId,
      name: "Abdülhamit Karaosmanoğlu",
      orderIndex: 0,
    });
    const [other] = await db()
      .insert(courses)
      .values({
        koskId: (
          await db()
            .insert(kosks)
            .values({ ownerId: AUTHOR_ID, name: "Başka Köşk" })
            .returning()
        )[0].id,
        madrasahId,
        authorId: AUTHOR_ID,
        title: "Mantık",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    madrasahCourseId = other.id;
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        {
          userId: PENDING_ID,
          courseId,
          status: EnrollmentStatus.PENDING,
        },
      ]);
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("POST /flashcard/decks", () => {
    it("takes a card type and tags, and starts private", async () => {
      const res = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(AUTHOR_ID))
        .send({
          title: "Kırk hadis",
          cardType: FlashcardType.HADEETH,
          tags: [" hadis ", "Hadis", "", "kırk"],
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        isPublic: false,
        cardType: FlashcardType.HADEETH,
        publishStatus: DeckPublishStatus.PRIVATE,
        publishRequestedAt: null,
        tags: ["hadis", "kırk"],
      });
    });

    it("defaults the card type to vocabulary", async () => {
      const res = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Renkler" });
      expect(res.status).toBe(201);
      expect(res.body.cardType).toBe(FlashcardType.VOCABULARY);
      expect(res.body.isPublic).toBe(false);
    });

    it("rejects a card type outside the enum and a long tag", async () => {
      const bad = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Renkler", cardType: "QUIZ" });
      expect(bad.status).toBe(400);
      const long = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Renkler", tags: ["x".repeat(41)] });
      expect(long.status).toBe(400);
    });

    it("keeps the status in step when a caller still sends isPublic", async () => {
      const res = await http()
        .post("/flashcard/decks")
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Açık deste", isPublic: true });
      expect(res.status).toBe(201);
      expect(res.body.publishStatus).toBe(DeckPublishStatus.PUBLISHED);
    });

    it("does not let a deck's card type be edited", async () => {
      const deck = await makeDeck({});
      const res = await http()
        .patch(`/flashcard/decks/${deck.id}`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({ cardType: FlashcardType.HADEETH });
      expect(res.status).toBe(400);
    });
  });

  describe("tags", () => {
    it("are the author's to read", async () => {
      const deck = await makeDeck({ isPublic: true, tags: ["sarf"] });
      const own = await http()
        .get(`/flashcard/decks/${deck.id}`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(own.body.tags).toEqual(["sarf"]);
      const other = await http()
        .get(`/flashcard/decks/${deck.id}`)
        .set("Authorization", auth(STRANGER_ID));
      expect(other.status).toBe(200);
      expect(other.body.tags).toEqual([]);
      const anonymous = await http().get(`/flashcard/decks/${deck.id}`);
      expect(anonymous.body.tags).toEqual([]);
      const list = await http()
        .get("/flashcard/decks?isPublic=true")
        .set("Authorization", auth(STRANGER_ID));
      expect(list.body[0].tags).toEqual([]);
    });
  });

  describe("GET /flashcard/decks/summary", () => {
    it("counts the caller's own progress, per deck", async () => {
      const deck = await makeDeck({ title: "Mehmûz fiiller" });
      const [a, b] = await Promise.all([
        makeCard(deck.id, "kart bir"),
        makeCard(deck.id, "kart iki"),
      ]);
      await makeCard(deck.id, "kart üç");
      await db()
        .insert(flashcardProgress)
        .values([
          {
            userId: AUTHOR_ID,
            flashcardId: a.id,
            status: FlashcardProgressStatus.MASTERED,
          },
          {
            userId: AUTHOR_ID,
            flashcardId: b.id,
            status: FlashcardProgressStatus.LEARNING,
          },
          // Somebody else's progress is not the caller's.
          {
            userId: TALEBE_ID,
            flashcardId: a.id,
            status: FlashcardProgressStatus.LEARNING,
          },
        ]);

      const res = await http()
        .get("/flashcard/decks/summary")
        .set("Authorization", auth(AUTHOR_ID));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: deck.id,
        isMine: true,
        source: "OWN",
        collectionKind: null,
        cardCount: 3,
        masteredCount: 1,
        learningCount: 1,
        newCount: 1,
        dueCount: 1,
        addedSinceCollectedCount: 0,
      });
    });

    it("lists the decks of other people the caller collected, with where they come from", async () => {
      const published = await makeDeck({
        title: "Açık deste",
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
      });
      const shared = await makeDeck({ title: "Ders destesi", courseId });
      const koskDeck = await makeDeck({ title: "Köşk destesi", koskId });
      await makeCard(published.id, "eski kart");
      await db()
        .insert(decksUsers)
        .values(
          [published, shared, koskDeck].map((d) => ({
            userId: TALEBE_ID,
            deckId: d.id,
          }))
        );
      // A card written after the talebe collected the deck is "new".
      await new Promise((r) => setTimeout(r, 20));
      await makeCard(published.id, "yeni kart");

      const res = await http()
        .get("/flashcard/decks/summary")
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      const byTitle = Object.fromEntries(
        res.body.map((d: { title: string }) => [d.title, d])
      );
      expect(byTitle["Açık deste"]).toMatchObject({
        source: "COLLECTION",
        collectionKind: "PUBLIC",
        isMine: false,
        inCollection: true,
        contextTitle: null,
        cardCount: 2,
        addedSinceCollectedCount: 1,
      });
      expect(byTitle["Ders destesi"]).toMatchObject({
        collectionKind: "COURSE",
        contextTitle: "Emsile ve Bina",
        muderrisName: "Abdülhamit Karaosmanoğlu",
      });
      expect(byTitle["Köşk destesi"]).toMatchObject({
        collectionKind: "KOSK",
        contextTitle: "Nûruosmaniye Köşkü",
        muderrisName: null,
      });
    });

    it("drops a collected deck the caller may no longer read", async () => {
      const deck = await makeDeck({ title: "Geri çekilen", isPublic: true });
      await db()
        .insert(decksUsers)
        .values({ userId: STRANGER_ID, deckId: deck.id });
      await db()
        .update(decks)
        .set({ isPublic: false })
        .where(eq(decks.id, deck.id));
      const res = await http()
        .get("/flashcard/decks/summary")
        .set("Authorization", auth(STRANGER_ID));
      expect(res.body).toEqual([]);
    });

    it("leaves a hidden deck out", async () => {
      await makeDeck({ title: "Gizlenmiş", archivedAt: new Date() });
      const res = await http()
        .get("/flashcard/decks/summary")
        .set("Authorization", auth(AUTHOR_ID));
      expect(res.body).toEqual([]);
    });

    it("needs a token", async () => {
      const res = await http().get("/flashcard/decks/summary");
      expect(res.status).toBe(401);
    });
  });

  describe("GET /flashcard/decks/explore", () => {
    it("shows the enrolled talebe the decks of their courses, köşks and medreses", async () => {
      const byCourse = await makeDeck({ title: "Ders destesi", courseId });
      const byKosk = await makeDeck({ title: "Köşk destesi", koskId });
      await makeDeck({
        title: "Medrese destesi",
        madrasahId,
      });
      await makeDeck({ title: "Başka ders", courseId: madrasahCourseId });
      await makeDeck({ title: "Özel ve bağsız" });
      const published = await makeDeck({
        title: "Herkese açık",
        isPublic: true,
      });
      await makeCard(byCourse.id, "kart");
      await db()
        .insert(decksUsers)
        .values({ userId: TALEBE_ID, deckId: byKosk.id });

      const res = await http()
        .get("/flashcard/decks/explore")
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      const titles = res.body.courseDecks.map(
        (d: { title: string }) => d.title
      );
      expect(titles.sort()).toEqual(["Ders destesi", "Köşk destesi"]);
      expect(res.body.publicDecks.map((d: { id: string }) => d.id)).toEqual([
        published.id,
      ]);
      const kosk = res.body.courseDecks.find(
        (d: { title: string }) => d.title === "Köşk destesi"
      );
      expect(kosk.inCollection).toBe(true);
      const course = res.body.courseDecks.find(
        (d: { title: string }) => d.title === "Ders destesi"
      );
      expect(course).toMatchObject({
        inCollection: false,
        cardCount: 1,
        contextTitle: "Emsile ve Bina",
      });
    });

    it("shows nothing course-bound to a stranger or to a talebe whose request waits", async () => {
      await makeDeck({ title: "Ders destesi", courseId });
      for (const sub of [STRANGER_ID, PENDING_ID]) {
        const res = await http()
          .get("/flashcard/decks/explore")
          .set("Authorization", auth(sub));
        expect(res.body.courseDecks).toEqual([]);
      }
    });

    it("lists the caller's own published deck as theirs, and no private deck of anybody else's", async () => {
      await makeDeck({ title: "Benim açık", isPublic: true });
      await makeDeck({ title: "Başkasının özeli", authorId: STRANGER_ID });
      const res = await http()
        .get("/flashcard/decks/explore")
        .set("Authorization", auth(AUTHOR_ID));
      expect(res.body.publicDecks).toHaveLength(1);
      expect(res.body.publicDecks[0]).toMatchObject({
        title: "Benim açık",
        isMine: true,
      });
      expect(res.body.courseDecks).toEqual([]);
    });

    it("filters by card type in both sections", async () => {
      await makeDeck({ title: "Kelime", courseId });
      await makeDeck({
        title: "Hadis dersi",
        courseId,
        cardType: FlashcardType.HADEETH,
      });
      await makeDeck({ title: "Açık kelime", isPublic: true });
      await makeDeck({
        title: "Açık hadis",
        isPublic: true,
        cardType: FlashcardType.HADEETH,
      });
      const res = await http()
        .get("/flashcard/decks/explore?cardType=VOCABULARY")
        .set("Authorization", auth(TALEBE_ID));
      expect(
        res.body.courseDecks.map((d: { title: string }) => d.title)
      ).toEqual(["Kelime"]);
      expect(
        res.body.publicDecks.map((d: { title: string }) => d.title)
      ).toEqual(["Açık kelime"]);
      const bad = await http()
        .get("/flashcard/decks/explore?cardType=QUIZ")
        .set("Authorization", auth(TALEBE_ID));
      expect(bad.status).toBe(400);
    });
  });

  describe("a deck that belongs to a course", () => {
    let deckId: string;
    let cardId: string;

    beforeEach(async () => {
      const deck = await makeDeck({ title: "Ders destesi", courseId });
      deckId = deck.id;
      cardId = (await makeCard(deckId, "kart")).id;
    });

    it("is read, collected and studied by the enrolled talebe", async () => {
      const read = await http()
        .get(`/flashcard/decks/${deckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(read.status).toBe(200);
      const cards = await http()
        .get(`/flashcard/cards?deckId=${deckId}&include=progress`)
        .set("Authorization", auth(TALEBE_ID));
      expect(cards.status).toBe(200);
      expect(cards.body).toHaveLength(1);
      const one = await http()
        .get(`/flashcard/cards/${cardId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(one.status).toBe(200);
      const collect = await http()
        .post(`/flashcard/decks/${deckId}/collections`)
        .set("Authorization", auth(TALEBE_ID));
      expect(collect.status).toBe(201);
      const again = await http()
        .post(`/flashcard/decks/${deckId}/collections`)
        .set("Authorization", auth(TALEBE_ID));
      expect(again.status).toBe(201);
      expect(again.body.createdAt).toBe(collect.body.createdAt);
      const progress = await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(TALEBE_ID))
        .send([{ flashcardId: cardId, status: "LEARNING" }]);
      expect(progress.status).toBe(200);
    });

    it("is written by nobody but its author", async () => {
      const newCard = await http()
        .post(`/flashcard/decks/${deckId}/cards`)
        .set("Authorization", auth(TALEBE_ID))
        .send([
          {
            type: FlashcardType.VOCABULARY,
            contentFront: "yeni",
            contentBack: "anlam",
          },
        ]);
      expect(newCard.status).toBe(403);
      const edit = await http()
        .patch(`/flashcard/decks/${deckId}`)
        .set("Authorization", auth(TALEBE_ID))
        .send({ title: "Benim oldu" });
      expect(edit.status).toBe(403);
      const remove = await http()
        .delete(`/flashcard/decks/${deckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(remove.status).toBe(403);
      const publish = await http()
        .post(`/flashcard/decks/${deckId}/publish-request`)
        .set("Authorization", auth(TALEBE_ID));
      expect(publish.status).toBe(403);
    });

    it("answers a stranger and a waiting applicant as it answers a deck that is not there", async () => {
      for (const sub of [STRANGER_ID, PENDING_ID]) {
        for (const path of [
          `/flashcard/decks/${deckId}`,
          `/flashcard/cards?deckId=${deckId}`,
          `/flashcard/cards/${cardId}`,
        ]) {
          const res = await http().get(path).set("Authorization", auth(sub));
          expect(res.status, `${sub} ${path}`).toBe(404);
        }
        const collect = await http()
          .post(`/flashcard/decks/${deckId}/collections`)
          .set("Authorization", auth(sub));
        expect(collect.status).toBe(404);
        const progress = await http()
          .put("/flashcard/cards/progress")
          .set("Authorization", auth(sub))
          .send([{ flashcardId: cardId, status: "LEARNING" }]);
        expect(progress.status).toBe(403);
      }
    });

    it("is closed to the talebe once the course is hidden or the enrollment is not live", async () => {
      await db()
        .update(courses)
        .set({ archivedAt: new Date() })
        .where(eq(courses.id, courseId));
      const hidden = await http()
        .get(`/flashcard/decks/${deckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(hidden.status).toBe(404);
    });

    it("is closed to everyone but its author once the deck is hidden", async () => {
      await db()
        .update(decks)
        .set({ archivedAt: new Date() })
        .where(eq(decks.id, deckId));
      const res = await http()
        .get(`/flashcard/decks/${deckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(404);
    });

    it("is not readable without a token", async () => {
      const res = await http().get(`/flashcard/decks/${deckId}`);
      expect(res.status).toBe(404);
    });
  });

  describe("publish request", () => {
    it("is asked for by the author, once, and taken back", async () => {
      const deck = await makeDeck({ title: "Mehmûz fiiller" });
      const ask = await http()
        .post(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(ask.status).toBe(201);
      expect(ask.body).toMatchObject({
        publishStatus: DeckPublishStatus.PENDING,
        isPublic: false,
      });
      expect(new Date(ask.body.publishRequestedAt).getTime()).toBeGreaterThan(
        Date.now() - 60_000
      );

      const twice = await http()
        .post(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(twice.status).toBe(409);
      expect(twice.body.code ?? twice.body.error?.code).toBe(
        "DECK_PUBLISH_STATE_CONFLICT"
      );

      const read = await http()
        .get("/flashcard/decks/summary")
        .set("Authorization", auth(AUTHOR_ID));
      expect(read.body[0]).toMatchObject({
        publishStatus: DeckPublishStatus.PENDING,
      });
      expect(read.body[0].publishRequestedAt).not.toBeNull();

      const withdraw = await http()
        .delete(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(withdraw.status).toBe(200);
      expect(withdraw.body).toMatchObject({
        publishStatus: DeckPublishStatus.PRIVATE,
        publishRequestedAt: null,
      });

      const nothing = await http()
        .delete(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(nothing.status).toBe(409);
    });

    it("lets the author turn a published deck private again, and refuses a second request on one", async () => {
      const deck = await makeDeck({
        isPublic: true,
        publishStatus: DeckPublishStatus.PUBLISHED,
      });
      const ask = await http()
        .post(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(ask.status).toBe(409);
      const withdraw = await http()
        .delete(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(withdraw.status).toBe(200);
      expect(withdraw.body).toMatchObject({
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
      });
    });

    it("is refused to anybody but the author", async () => {
      const own = await makeDeck({ isPublic: true });
      const secret = await makeDeck({ title: "Özel", authorId: AUTHOR_ID });
      const publicDeck = await http()
        .post(`/flashcard/decks/${own.id}/publish-request`)
        .set("Authorization", auth(STRANGER_ID));
      expect(publicDeck.status).toBe(403);
      const privateDeck = await http()
        .post(`/flashcard/decks/${secret.id}/publish-request`)
        .set("Authorization", auth(STRANGER_ID));
      expect(privateDeck.status).toBe(404);
      const withdraw = await http()
        .delete(`/flashcard/decks/${own.id}/publish-request`)
        .set("Authorization", auth(STRANGER_ID));
      expect(withdraw.status).toBe(403);
    });

    it("keeps a pending request when the deck is renamed", async () => {
      const deck = await makeDeck({ title: "Mehmûz fiiller" });
      await http()
        .post(`/flashcard/decks/${deck.id}/publish-request`)
        .set("Authorization", auth(AUTHOR_ID));
      const edit = await http()
        .patch(`/flashcard/decks/${deck.id}`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Mehmûz fiiller 2", description: "Kısa" });
      expect(edit.status).toBe(200);
      expect(edit.body).toMatchObject({
        title: "Mehmûz fiiller 2",
        description: "Kısa",
        publishStatus: DeckPublishStatus.PENDING,
      });
      expect(edit.body.publishRequestedAt).not.toBeNull();
    });
  });
});
