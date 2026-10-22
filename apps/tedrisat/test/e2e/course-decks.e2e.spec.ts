import { INestApplication } from "@nestjs/common";
import { eq } from "drizzle-orm";
import request from "supertest";
import { CourseStatus } from "../../src/course/domain/course-status.enum";
import { EnrollmentStatus } from "../../src/course/domain/enrollment-status.enum";
import { DatabaseService } from "../../src/database/database.service";
import {
  courses,
  courseWeeks,
  enrollments,
} from "../../src/database/schema/course.schema";
import {
  flashcardProgress,
  flashcards,
} from "../../src/database/schema/flashcard.schema";
import { decks } from "../../src/database/schema/flashcard-deck.schema";
import { kosks } from "../../src/database/schema/kosk.schema";
import {
  ASSIGNED_ROLES,
  roleAssignments,
  SCOPE_TYPES,
} from "../../src/database/schema/role-assignment.schema";
import { FlashcardProgressStatus } from "../../src/flashcard/domain/flashcard-progress-status.enum";
import { FlashcardType } from "../../src/flashcard/domain/flashcard-type.enum";
import { createTestApp } from "../helpers/test-app.helper";
import {
  COURSE_TREE_TABLES,
  TestDatabaseUtils,
} from "../helpers/test-database.helper";
import { bearerFor } from "../helpers/test-keycloak.helper";

/**
 * Ders destesi (ders destesi, course decks): the course's staff write its decks
 * and cards, the enrolled talebe read the published ones with their own
 * progress, and a personal deck never opens to a müderris. Real guard, real
 * engine, no stub.
 */
const AUTHOR_ID = "f1000000-0000-4000-8000-000000000001";
const COLLEAGUE_ID = "f1000000-0000-4000-8000-000000000002";
const TALEBE_ID = "f1000000-0000-4000-8000-000000000003";
const PENDING_ID = "f1000000-0000-4000-8000-000000000004";
const OUTSIDER_ID = "f1000000-0000-4000-8000-000000000005";
const PERSONAL_OWNER_ID = "f1000000-0000-4000-8000-000000000006";

const auth = (sub: string) => bearerFor({ sub });

const TABLES = [
  "flashcard_progress",
  "decks_users",
  "flashcards",
  "decks",
  ...COURSE_TREE_TABLES,
] as const;

describe("Course decks (ders destesi) (e2e)", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let dbUtils: TestDatabaseUtils;
  const http = () => request(app.getHttpServer());
  const db = () => databaseService.db;

  let courseId: string;
  let otherCourseId: string;
  let weekId: string;
  let otherWeekId: string;
  let publishedDeckId: string;
  let draftDeckId: string;
  let personalDeckId: string;
  let cardIds: string[];

  const makeDeck = async (values: Partial<typeof decks.$inferInsert>) => {
    const [row] = await db()
      .insert(decks)
      .values({ authorId: AUTHOR_ID, title: "Bir deste", ...values })
      .returning();
    return row;
  };

  const makeCard = async (deckId: string, front: string) => {
    const [row] = await db()
      .insert(flashcards)
      .values({
        deckId,
        authorId: AUTHOR_ID,
        type: FlashcardType.VOCABULARY,
        contentFront: front,
        contentBack: `${front} anlamı`,
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
    const [course] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: AUTHOR_ID,
        title: "Emsile ve Bina",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    courseId = course.id;
    const [otherCourse] = await db()
      .insert(courses)
      .values({
        koskId: kosk.id,
        authorId: AUTHOR_ID,
        title: "Mantık",
        status: CourseStatus.PUBLISHED,
      })
      .returning();
    otherCourseId = otherCourse.id;

    const [week] = await db()
      .insert(courseWeeks)
      .values({ courseId, weekNumber: 1, title: "Birinci hafta" })
      .returning();
    weekId = week.id;
    const [otherWeek] = await db()
      .insert(courseWeeks)
      .values({ courseId: otherCourseId, weekNumber: 1, title: "Başka hafta" })
      .returning();
    otherWeekId = otherWeek.id;

    for (const userId of [AUTHOR_ID, COLLEAGUE_ID]) {
      await db().insert(roleAssignments).values({
        userId,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: courseId,
        grantedBy: AUTHOR_ID,
      });
    }
    await db()
      .insert(enrollments)
      .values([
        { userId: TALEBE_ID, courseId, status: EnrollmentStatus.ENROLLED },
        { userId: PENDING_ID, courseId, status: EnrollmentStatus.PENDING },
      ]);

    const published = await makeDeck({
      courseId,
      weekId,
      title: "Emsile kelimeleri",
      cardType: FlashcardType.VOCABULARY,
    });
    publishedDeckId = published.id;
    const draft = await makeDeck({
      courseId,
      courseDraft: true,
      title: "Taslak deste",
    });
    draftDeckId = draft.id;
    const personal = await makeDeck({
      authorId: PERSONAL_OWNER_ID,
      title: "Kişisel deste",
    });
    personalDeckId = personal.id;

    const first = await makeCard(publishedDeckId, "kâtib");
    const second = await makeCard(publishedDeckId, "mütercim");
    cardIds = [first.id, second.id];
  });

  afterAll(async () => {
    await dbUtils.cleanTables(...TABLES);
    await app.close();
  });

  describe("POST /courses/:id/decks", () => {
    it("lets a müderris of the course open a deck, which starts shown", async () => {
      const res = await http()
        .post(`/courses/${courseId}/decks`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({
          title: "Yeni deste",
          cardType: FlashcardType.VOCABULARY,
          weekId,
        });
      expect(res.status).toBe(201);
      const [row] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, res.body.id));
      expect(row).toMatchObject({
        authorId: AUTHOR_ID,
        courseId,
        weekId,
        courseDraft: false,
        isPublic: false,
      });
    });

    it("opens a draft when asked", async () => {
      const res = await http()
        .post(`/courses/${courseId}/decks`)
        .set("Authorization", auth(COLLEAGUE_ID))
        .send({
          title: "Taslak yeni",
          cardType: FlashcardType.HADEETH,
          draft: true,
        });
      expect(res.status).toBe(201);
      const [row] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, res.body.id));
      expect(row.courseDraft).toBe(true);
    });

    it("refuses a talebe, a pending talebe and a stranger", async () => {
      for (const sub of [TALEBE_ID, PENDING_ID, OUTSIDER_ID]) {
        const res = await http()
          .post(`/courses/${courseId}/decks`)
          .set("Authorization", auth(sub))
          .send({ title: "Girilmez", cardType: FlashcardType.VOCABULARY });
        expect(res.status).toBe(403);
      }
    });

    it("refuses a week that is not one of the course's", async () => {
      const res = await http()
        .post(`/courses/${courseId}/decks`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({
          title: "Yanlış hafta",
          cardType: FlashcardType.VOCABULARY,
          weekId: otherWeekId,
        });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("COURSE_WEEK_NOT_IN_COURSE");
    });
  });

  describe("cards of a course deck", () => {
    it("lets a second müderris of the course add cards to a deck they did not write", async () => {
      const res = await http()
        .post(`/flashcard/decks/${publishedDeckId}/cards`)
        .set("Authorization", auth(COLLEAGUE_ID))
        .send([
          {
            type: FlashcardType.VOCABULARY,
            contentFront: "nahiv",
            contentBack: "nahiv anlamı",
          },
        ]);
      expect(res.status).toBe(201);
    });

    it("keeps a personal deck closed to a müderris, reads and writes alike", async () => {
      const read = await http()
        .get(`/flashcard/decks/${personalDeckId}`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(read.status).toBe(404);
      const write = await http()
        .post(`/flashcard/decks/${personalDeckId}/cards`)
        .set("Authorization", auth(AUTHOR_ID))
        .send([
          {
            type: FlashcardType.VOCABULARY,
            contentFront: "sarf",
            contentBack: "sarf anlamı",
          },
        ]);
      expect(write.status).toBe(404);
      const edit = await http()
        .patch(`/flashcard/decks/${personalDeckId}`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Değiştirilemez" });
      expect(edit.status).toBe(404);
    });
  });

  describe("reading", () => {
    it("hides a draft from the talebe and from a stranger, and shows it to the staff", async () => {
      for (const sub of [TALEBE_ID, OUTSIDER_ID]) {
        const res = await http()
          .get(`/flashcard/decks/${draftDeckId}`)
          .set("Authorization", auth(sub));
        expect(res.status).toBe(404);
      }
      const staff = await http()
        .get(`/flashcard/decks/${draftDeckId}`)
        .set("Authorization", auth(COLLEAGUE_ID));
      expect(staff.status).toBe(200);
    });

    it("shows a published course deck to its enrolled talebe", async () => {
      const res = await http()
        .get(`/flashcard/decks/${publishedDeckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
    });

    it("leaves a draft out of Keşfet", async () => {
      const res = await http()
        .get("/flashcard/decks/explore")
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      const ids = res.body.courseDecks.map((deck: { id: string }) => deck.id);
      expect(ids).toContain(publishedDeckId);
      expect(ids).not.toContain(draftDeckId);
    });

    it("gives the talebe the published decks with their own progress", async () => {
      await db()
        .insert(flashcardProgress)
        .values([
          {
            userId: TALEBE_ID,
            flashcardId: cardIds[0],
            status: FlashcardProgressStatus.MASTERED,
          },
          {
            userId: TALEBE_ID,
            flashcardId: cardIds[1],
            status: FlashcardProgressStatus.LEARNING,
          },
        ]);
      const res = await http()
        .get(`/courses/${courseId}/decks`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: publishedDeckId,
        weekNumber: 1,
        cardCount: 2,
        masteredCount: 1,
        learningCount: 1,
        newCount: 0,
      });
    });

    it("keeps the course's list from a stranger and from a pending talebe", async () => {
      for (const sub of [OUTSIDER_ID, PENDING_ID]) {
        const res = await http()
          .get(`/courses/${courseId}/decks`)
          .set("Authorization", auth(sub));
        expect(res.status).toBe(403);
      }
    });

    it("keeps the staff list from the talebe", async () => {
      const res = await http()
        .get(`/courses/${courseId}/decks/manage`)
        .set("Authorization", auth(TALEBE_ID));
      expect(res.status).toBe(403);
    });
  });

  describe("GET /courses/:id/decks/manage", () => {
    it("lists drafts too, with the share of MASTERED cards", async () => {
      await db().insert(flashcardProgress).values({
        userId: TALEBE_ID,
        flashcardId: cardIds[0],
        status: FlashcardProgressStatus.MASTERED,
      });
      const res = await http()
        .get(`/courses/${courseId}/decks/manage`)
        .set("Authorization", auth(AUTHOR_ID));
      expect(res.status).toBe(200);
      const byId = new Map(
        res.body.map((deck: { id: string }) => [deck.id, deck])
      );
      expect(byId.get(draftDeckId)).toMatchObject({
        draft: true,
        cardCount: 0,
        masteredRatio: 0,
        enrolledCount: 1,
      });
      // 1 MASTERED row over 2 cards x 1 enrolled talebe.
      expect(byId.get(publishedDeckId)).toMatchObject({
        draft: false,
        weekId,
        weekNumber: 1,
        cardCount: 2,
        masteredRatio: 0.5,
      });
    });
  });

  describe("PATCH and DELETE", () => {
    it("edits the deck's title, week and draft, and refuses another course's week", async () => {
      const res = await http()
        .patch(`/courses/${courseId}/decks/${draftDeckId}`)
        .set("Authorization", auth(COLLEAGUE_ID))
        .send({ title: "Yayımlanan deste", weekId, draft: false });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: draftDeckId,
        title: "Yayımlanan deste",
        weekId,
        draft: false,
      });

      const bad = await http()
        .patch(`/courses/${courseId}/decks/${draftDeckId}`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({ weekId: otherWeekId });
      expect(bad.status).toBe(400);
    });

    it("answers 404 for a deck of another course", async () => {
      // The caller staffs both courses, so the course guard lets them in and
      // the deck is not one of the other course's.
      await db().insert(roleAssignments).values({
        userId: AUTHOR_ID,
        role: ASSIGNED_ROLES.MUDERRIS,
        scopeType: SCOPE_TYPES.COURSE,
        scopeId: otherCourseId,
        grantedBy: AUTHOR_ID,
      });
      const res = await http()
        .patch(`/courses/${otherCourseId}/decks/${publishedDeckId}`)
        .set("Authorization", auth(AUTHOR_ID))
        .send({ title: "Başka ders" });
      expect(res.status).toBe(404);
    });

    it("refuses a talebe's delete", async () => {
      const refused = await http()
        .delete(`/courses/${courseId}/decks/${publishedDeckId}`)
        .set("Authorization", auth(TALEBE_ID));
      expect(refused.status).toBe(403);
    });

    it("answers 409 to deleting a published deck, which stays", async () => {
      const res = await http()
        .delete(`/courses/${courseId}/decks/${publishedDeckId}`)
        .set("Authorization", auth(COLLEAGUE_ID));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COURSE_DECK_NOT_DRAFT");
      const [still] = await db()
        .select()
        .from(decks)
        .where(eq(decks.id, publishedDeckId));
      expect(still).toBeDefined();
    });

    it("takes a published deck from the talebe by draft, keeping their progress, then lets the staff delete it", async () => {
      await db().insert(flashcardProgress).values({
        userId: TALEBE_ID,
        flashcardId: cardIds[0],
        status: FlashcardProgressStatus.MASTERED,
      });
      const hide = await http()
        .patch(`/courses/${courseId}/decks/${publishedDeckId}`)
        .set("Authorization", auth(COLLEAGUE_ID))
        .send({ draft: true });
      expect(hide.status).toBe(200);
      expect(hide.body.draft).toBe(true);

      const list = await http()
        .get(`/courses/${courseId}/decks`)
        .set("Authorization", auth(TALEBE_ID));
      expect(list.body.map((deck: { id: string }) => deck.id)).not.toContain(
        publishedDeckId
      );
      const progress = await db()
        .select()
        .from(flashcardProgress)
        .where(eq(flashcardProgress.userId, TALEBE_ID));
      expect(progress).toHaveLength(1);

      const res = await http()
        .delete(`/courses/${courseId}/decks/${publishedDeckId}`)
        .set("Authorization", auth(COLLEAGUE_ID));
      expect(res.status).toBe(204);
      const left = await db()
        .select()
        .from(flashcards)
        .where(eq(flashcards.deckId, publishedDeckId));
      expect(left).toHaveLength(0);
    });
  });
});
