import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { DatabaseService } from "../database/database.service";
import { courseWeeks, enrollments } from "../database/schema/course.schema";
import {
  flashcardProgress,
  flashcards,
} from "../database/schema/flashcard.schema";
import { decks } from "../database/schema/flashcard-deck.schema";
import { deckSharedWith } from "./deck-sharing";
import { FlashcardProgressStatus } from "./domain/flashcard-progress-status.enum";
import { FlashcardType } from "./domain/flashcard-type.enum";

/** The enrollments whose talebe count as enrolled for a course's decks. */
const ENROLLED_STATUSES = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.COMPLETED,
];

/** A course deck as its staff list it, before the counts are added. */
export interface CourseDeckRow {
  id: string;
  title: string;
  description: string | null;
  cardType: FlashcardType;
  weekId: string | null;
  weekNumber: number | null;
  draft: boolean;
}

/** A course deck as an enrolled talebe lists it, before their progress is added. */
export interface CourseDeckStudentRow {
  id: string;
  title: string;
  description: string | null;
  cardType: FlashcardType;
  weekId: string | null;
  weekNumber: number | null;
}

/**
 * The reads and writes of a course's decks (ders destesi). Everything here is
 * scoped to one course by id; the deck's own authorization is the controller's
 * `@Authz`, the engine's course-deck staff rule and `deckSharedWith`.
 */
@Injectable()
export class CourseDeckRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** A week of the course that is still shown, or null. */
  async findShownWeek(
    courseId: string,
    weekId: string
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: courseWeeks.id })
      .from(courseWeeks)
      .where(
        and(
          eq(courseWeeks.id, weekId),
          eq(courseWeeks.courseId, courseId),
          isNull(courseWeeks.archivedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** The course's deck with this id, when it belongs to the course. */
  async findCourseDeckId(
    courseId: string,
    deckId: string
  ): Promise<{ id: string; courseDraft: boolean } | null> {
    const [row] = await this.db
      .select({ id: decks.id, courseDraft: decks.courseDraft })
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.courseId, courseId)))
      .limit(1);
    return row ?? null;
  }

  async insertDeck(values: {
    authorId: string;
    courseId: string;
    title: string;
    description: string | null;
    cardType: FlashcardType;
    weekId: string | null;
    courseDraft: boolean;
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(decks)
      .values(values)
      .returning({ id: decks.id });
    return row;
  }

  async updateDeck(
    deckId: string,
    values: Partial<{
      title: string;
      description: string | null;
      weekId: string | null;
      courseDraft: boolean;
    }>
  ): Promise<void> {
    await this.db
      .update(decks)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(decks.id, deckId));
  }

  /** Every deck of the course, drafts included, in the order the staff list them. */
  async listForStaff(courseId: string): Promise<CourseDeckRow[]> {
    return this.db
      .select({
        id: decks.id,
        title: decks.title,
        description: decks.description,
        cardType: decks.cardType,
        weekId: decks.weekId,
        weekNumber: courseWeeks.weekNumber,
        draft: decks.courseDraft,
      })
      .from(decks)
      .leftJoin(courseWeeks, eq(courseWeeks.id, decks.weekId))
      .where(eq(decks.courseId, courseId))
      .orderBy(asc(courseWeeks.orderIndex), asc(decks.createdAt));
  }

  /**
   * The decks the talebe may read: published course decks they are enrolled
   * for (`deckSharedWith`, which leaves drafts and hidden decks out).
   */
  async listForStudent(
    courseId: string,
    userId: string
  ): Promise<CourseDeckStudentRow[]> {
    return this.db
      .select({
        id: decks.id,
        title: decks.title,
        description: decks.description,
        cardType: decks.cardType,
        weekId: decks.weekId,
        weekNumber: courseWeeks.weekNumber,
      })
      .from(decks)
      .leftJoin(courseWeeks, eq(courseWeeks.id, decks.weekId))
      .where(and(eq(decks.courseId, courseId), deckSharedWith(userId)))
      .orderBy(asc(courseWeeks.orderIndex), asc(decks.createdAt));
  }

  /** How many talebe are enrolled in the course (ENROLLED or COMPLETED). */
  async countEnrolled(courseId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, ENROLLED_STATUSES)
        )
      );
    return row?.count ?? 0;
  }

  /** Cards per deck, for the given decks. */
  async cardCounts(deckIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (deckIds.length === 0) return counts;
    const rows = await this.db
      .select({
        deckId: flashcards.deckId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(flashcards)
      .where(inArray(flashcards.deckId, deckIds))
      .groupBy(flashcards.deckId);
    for (const row of rows) counts.set(row.deckId, row.count);
    return counts;
  }

  /**
   * MASTERED card rows per deck, counted over the talebe enrolled in the
   * course: a progress row of someone who has left the course does not count.
   */
  async masteredRowCounts(
    courseId: string,
    deckIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (deckIds.length === 0) return counts;
    const rows = await this.db
      .select({
        deckId: flashcards.deckId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(flashcardProgress)
      .innerJoin(flashcards, eq(flashcards.id, flashcardProgress.flashcardId))
      .innerJoin(
        enrollments,
        and(
          eq(enrollments.userId, flashcardProgress.userId),
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, ENROLLED_STATUSES)
        )
      )
      .where(
        and(
          inArray(flashcards.deckId, deckIds),
          eq(flashcardProgress.status, FlashcardProgressStatus.MASTERED)
        )
      )
      .groupBy(flashcards.deckId);
    for (const row of rows) counts.set(row.deckId, row.count);
    return counts;
  }
}
