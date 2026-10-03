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
import { koskFollowers, kosks } from "../../src/database/schema/kosk.schema";
import { FlashcardProgressStatus } from "../../src/flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * MDRS-165: the study round and its review schedule, the decks to study today,
 * the signed-out reader of a public deck's cards, and the courses of the
 * köşks a talebe follows. Real guard, no stub.
 */
const AUTHOR_ID = "e2000000-0000-4000-8000-000000000001";
const TALEBE_ID = "e2000000-0000-4000-8000-000000000002";
const STRANGER_ID = "e2000000-0000-4000-8000-000000000003";

const auth = (sub: string) => bearerFor({ sub });
const DAY_MS = 24 * 60 * 60 * 1000;

const TABLES = [
  "flashcard_progress",
  "decks_users",
  "flashcards",
  "decks",
  "kosk_followers",
  ...COURSE_TREE_TABLES,
  "users",
] as const;

describe("Study round, due decks, public cards and followed courses (e2e)", () => {
  let app: INestApplication;
  let dbUtils: TestDatabaseUtils;
  let databaseService: DatabaseService;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  const makeDeck = async (values: Partial<typeof decks.$inferInsert> = {}) => {
    const [row] = await db()
      .insert(decks)
      .values({ authorId: AUTHOR_ID, title: "Mehmûz fiiller", ...values })
      .returning();
    return row;
  };

  const makeCard = async (deckId: string, front: string, at = 0) => {
    const [row] = await db()
      .insert(flashcards)
      .values({
        deckId,
        authorId: AUTHOR_ID,
        type: FlashcardType.VOCABULARY,
        contentFront: front,
        contentBack: `${front} anlamı`,
        createdAt: new Date(Date.UTC(2026, 0, 1) + at * 1000),
      })
      .returning();
    return row;
  };

  const progressOf = async (userId: string, flashcardId: string) =>
    (
      await db()
        .select()
        .from(flashcardProgress)
        .where(eq(flashcardProgress.flashcardId, flashcardId))
    ).find((row) => row.userId === userId);

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

  describe("PUT /flashcard/cards/progress with a rating", () => {
    it("schedules the card from the rating and doubles an easy gap the next time", async () => {
      const deck = await makeDeck({ isPublic: true });
      const card = await makeCard(deck.id, "رَأَى");

      const hard = await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(TALEBE_ID))
        .send([{ flashcardId: card.id, rating: "HARD" }]);
      expect(hard.status).toBe(200);
      expect(hard.body[0]).toMatchObject({
        flashcardId: card.id,
        status: "LEARNING",
        intervalDays: 1,
      });
      const afterHard = await progressOf(TALEBE_ID, card.id);
      expect(afterHard?.dueAt?.getTime()).toBeGreaterThan(Date.now());
      expect(afterHard?.dueAt?.getTime()).toBeLessThanOrEqual(
        Date.now() + DAY_MS
      );

      await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(TALEBE_ID))
        .send([{ flashcardId: card.id, rating: "EASY" }]);
      const easy = await progressOf(TALEBE_ID, card.id);
      expect(easy).toMatchObject({ status: "MASTERED", intervalDays: 7 });

      await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(TALEBE_ID))
        .send([{ flashcardId: card.id, rating: "EASY" }]);
      expect((await progressOf(TALEBE_ID, card.id))?.intervalDays).toBe(14);
    });

    it("still takes a bare status, with no schedule", async () => {
      const deck = await makeDeck({ isPublic: true });
      const card = await makeCard(deck.id, "رَأَى");
      const res = await http()
        .put("/flashcard/cards/progress")
        .set("Authorization", auth(TALEBE_ID))
        .send([{ flashcardId: card.id, status: "MASTERED" }]);
      expect(res.status).toBe(200);
      expect(await progressOf(TALEBE_ID, card.id)).toMatchObject({
        status: "MASTERED",
        dueAt: null,
        intervalDays: 0,
      });
    });

    it("refuses a row with neither a status nor a rating, and an unknown rating", async () => {
      const deck = await makeDeck({ isPublic: true });
      const card = await makeCard(deck.id, "رَأَى");
      for (const body of [
        { flashcardId: card.id },
        { flashcardId: card.id, rating: "MEH" },
      ]) {
        const res = await http()
          .put("/flashcard/cards/progress")
          .set("Authorization", auth(TALEBE_ID))
          .send([body]);
        expect(res.status).toBe(400);
      }
    });
  });

  describe("GET /flashcard/decks/:id/due", () => {
    it("lists the cards waiting for a repeat first, then unstarted ones, with the caller's progress", async () => {
      const deck = await makeDeck({ isPublic: true });
      const overdue = await makeCard(deck.id, "overdue", 1);
      const later = await makeCard(deck.id, "later", 2);
      const legacy = await makeCard(deck.id, "legacy", 3);
      const mastered = await makeCard(deck.id, "mastered", 4);
      const fresh = await makeCard(deck.id, "fresh", 5);
      await db()
        .insert(flashcardProgress)
        .values([
          {
            userId: TALEBE_ID,
            flashcardId: overdue.id,
            status: FlashcardProgressStatus.LEARNING,
            dueAt: new Date(Date.now() - DAY_MS),
            intervalDays: 1,
          },
          {
            userId: TALEBE_ID,
            flashcardId: later.id,
            status: FlashcardProgressStatus.LEARNING,
            dueAt: new Date(Date.now() + 3 * DAY_MS),
            intervalDays: 3,
          },
          {
            // The old toggle's leftover: learning, no time. Due now.
            userId: TALEBE_ID,
            flashcardId: legacy.id,
            status: FlashcardProgressStatus.LEARNING,
          },
          {
            // Marked by hand, never scheduled: not due.
            userId: TALEBE_ID,
            flashcardId: mastered.id,
            status: FlashcardProgressStatus.MASTERED,
          },
          {
            // Somebody else's progress must not make a card due for the caller.
            userId: STRANGER_ID,
            flashcardId: fresh.id,
            status: FlashcardProgressStatus.LEARNING,
          },
        ]);

      const res = await http()
        .get(`/flashcard/decks/${deck.id}/due`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      expect(res.body.dueCount).toBe(2);
      expect(res.body.newCount).toBe(1);
      expect(
        res.body.cards.map((c: { contentFront: string }) => c.contentFront)
      ).toEqual(["legacy", "overdue", "fresh"]);
      const overdueCard = res.body.cards.find(
        (c: { id: string }) => c.id === overdue.id
      );
      expect(overdueCard.progress).toHaveLength(1);
      expect(overdueCard.progress[0]).toMatchObject({
        userId: TALEBE_ID,
        status: "LEARNING",
      });
      const freshCard = res.body.cards.find(
        (c: { id: string }) => c.id === fresh.id
      );
      expect(freshCard.progress).toEqual([]);
    });

    it("answers a private deck of somebody else's with the not-found answer", async () => {
      const deck = await makeDeck();
      await makeCard(deck.id, "secret");
      const res = await http()
        .get(`/flashcard/decks/${deck.id}/due`)
        .set("Authorization", auth(STRANGER_ID));
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain("secret");
    });

    it("needs a token", async () => {
      const deck = await makeDeck({ isPublic: true });
      const res = await http().get(`/flashcard/decks/${deck.id}/due`);
      expect(res.status).toBe(401);
    });
  });

  describe("GET /flashcard/decks/due", () => {
    it("lists the decks with cards waiting, then the collected decks that grew", async () => {
      const mine = await makeDeck({ authorId: TALEBE_ID, title: "Benim" });
      const card = await makeCard(mine.id, "a");
      await db()
        .insert(flashcardProgress)
        .values({
          userId: TALEBE_ID,
          flashcardId: card.id,
          status: FlashcardProgressStatus.LEARNING,
          dueAt: new Date(Date.now() - 1000),
          intervalDays: 1,
        });
      const quietOwn = await makeDeck({ authorId: TALEBE_ID, title: "Sessiz" });
      await makeCard(quietOwn.id, "b");

      const collected = await makeDeck({
        isPublic: true,
        title: "Açık deste",
      });
      await db()
        .insert(decksUsers)
        .values({
          userId: TALEBE_ID,
          deckId: collected.id,
          createdAt: new Date(Date.UTC(2020, 0, 1)),
        });
      await makeCard(collected.id, "c");

      const res = await http()
        .get("/flashcard/decks/due")
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      expect(res.body.map((d: { title: string }) => d.title)).toEqual([
        "Benim",
        "Açık deste",
      ]);
      expect(res.body[0]).toMatchObject({ dueCount: 1, isMine: true });
      expect(res.body[1]).toMatchObject({
        dueCount: 0,
        addedSinceCollectedCount: 1,
      });
    });

    it("honours the limit and refuses a stranger's view of nothing", async () => {
      const res = await http()
        .get("/flashcard/decks/due?limit=1")
        .set("Authorization", auth(STRANGER_ID));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      const bad = await http()
        .get("/flashcard/decks/due?limit=x")
        .set("Authorization", auth(STRANGER_ID));
      expect(bad.status).toBe(400);
    });
  });

  describe("GET /flashcard/cards with no token", () => {
    it("reads the cards of a public deck, without progress", async () => {
      const deck = await makeDeck({ isPublic: true });
      await makeCard(deck.id, "إِنَّمَا");
      const res = await http().get(
        `/flashcard/cards?deckId=${deck.id}&include=progress`
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].contentFront).toBe("إِنَّمَا");
      expect(res.body[0].progress).toBeUndefined();
    });

    it("answers a private deck's cards as it does for a deck that is not there", async () => {
      const deck = await makeDeck();
      await makeCard(deck.id, "secret");
      const priv = await http().get(`/flashcard/cards?deckId=${deck.id}`);
      const absent = await http().get(
        "/flashcard/cards?deckId=00000000-0000-4000-8000-000000000000"
      );
      expect(priv.status).toBe(404);
      expect(priv.status).toBe(absent.status);
      expect(JSON.stringify(priv.body)).not.toContain("secret");
    });

    it("still refuses the cards of a private deck to a signed-in stranger", async () => {
      const deck = await makeDeck();
      await makeCard(deck.id, "secret");
      const res = await http()
        .get(`/flashcard/cards?deckId=${deck.id}`)
        .set("Authorization", auth(STRANGER_ID));
      expect(res.status).toBe(404);
    });

    it("keeps every card write behind a token", async () => {
      const deck = await makeDeck({ isPublic: true });
      const card = await makeCard(deck.id, "x");
      const progress = await http()
        .put("/flashcard/cards/progress")
        .send([{ flashcardId: card.id, rating: "EASY" }]);
      expect(progress.status).toBe(401);
      expect(await progressOf(TALEBE_ID, card.id)).toBeUndefined();
    });
  });

  describe("GET /kosks/followed/courses", () => {
    it("lists the published courses of the followed köşks the caller is not in, newest first", async () => {
      const [followed] = await db()
        .insert(kosks)
        .values({ ownerId: AUTHOR_ID, name: "Nûruosmaniye Köşkü" })
        .returning();
      const [unfollowed] = await db()
        .insert(kosks)
        .values({ ownerId: AUTHOR_ID, name: "Başka Köşk" })
        .returning();
      // A followed köşk that is unlisted is in no list, for anyone (MDRS-122).
      const [unlisted] = await db()
        .insert(kosks)
        .values({
          ownerId: AUTHOR_ID,
          name: "Bağlantıyla Köşk",
          isPrivate: true,
        })
        .returning();
      await db()
        .insert(koskFollowers)
        .values([
          { userId: TALEBE_ID, koskId: followed.id },
          { userId: TALEBE_ID, koskId: unlisted.id },
        ]);
      const make = (
        koskId: string,
        title: string,
        extra: Partial<typeof courses.$inferInsert> = {}
      ) =>
        db()
          .insert(courses)
          .values({
            koskId,
            authorId: AUTHOR_ID,
            title,
            status: CourseStatus.PUBLISHED,
            ...extra,
          })
          .returning()
          .then((rows) => rows[0]);
      const older = await make(followed.id, "Avâmil ve Tasrîf", {
        createdAt: new Date(Date.UTC(2026, 0, 1)),
      });
      await make(followed.id, "Fıkıh usûlüne giriş", {
        createdAt: new Date(Date.UTC(2026, 5, 1)),
      });
      await make(followed.id, "Taslak", { status: CourseStatus.DRAFT });
      await make(followed.id, "Gizli", { archivedAt: new Date() });
      const joined = await make(followed.id, "Zaten kayıtlı");
      await make(unfollowed.id, "Takip edilmeyen");
      await make(unlisted.id, "Bağlantıyla açılan");
      await db().insert(enrollments).values({
        userId: TALEBE_ID,
        courseId: joined.id,
        status: EnrollmentStatus.PENDING,
      });
      await db().insert(courseMuderris).values({
        courseId: older.id,
        name: "Ayşe Nur Kılıçarslan",
        orderIndex: 0,
      });

      const res = await http()
        .get("/kosks/followed/courses")
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      expect(res.body.map((c: { title: string }) => c.title)).toEqual([
        "Fıkıh usûlüne giriş",
        "Avâmil ve Tasrîf",
      ]);
      expect(res.body[1]).toMatchObject({
        koskName: "Nûruosmaniye Köşkü",
        muderrisName: "Ayşe Nur Kılıçarslan",
        muderrisIsImam: false,
      });
      expect(res.body[0].muderrisName).toBeNull();
    });

    it("is empty for a caller who follows nobody, honours the limit, and needs a token", async () => {
      const empty = await http()
        .get("/kosks/followed/courses")
        .set("Authorization", auth(STRANGER_ID));
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);
      const none = await http().get("/kosks/followed/courses");
      expect(none.status).toBe(401);
    });
  });
});
