import { Injectable } from "@nestjs/common";
import { CourseDeckRepository } from "./course-deck.repository";
import {
  CourseDeckManageResponse,
  CourseDeckStudentResponse,
  CreateCourseDeckDto,
  UpdateCourseDeckDto,
} from "./dto/course-deck.dto";
import { CourseDeckNotDraftError } from "./errors/course-deck-not-draft.error";
import { CourseWeekNotInCourseError } from "./errors/course-week-not-in-course.error";
import { DeckNotFoundError } from "./errors/deck-not-found.error";
import { FlashcardDeckService } from "./flashcard-deck.service";
import { FlashcardDeckSummaryRepository } from "./flashcard-deck-summary.repository";

/**
 * The decks of a course (ders destesi): what its staff write and what its
 * enrolled talebe read. Authorization is the controller's `@Authz`; this
 * service checks only that a deck or week named in the path belongs to the
 * course.
 */
@Injectable()
export class CourseDeckService {
  constructor(
    private readonly repo: CourseDeckRepository,
    private readonly deckService: FlashcardDeckService,
    private readonly summaryRepo: FlashcardDeckSummaryRepository
  ) {}

  /** The course's decks for its staff, drafts included, with the talebe's mastery. */
  async listForStaff(courseId: string): Promise<CourseDeckManageResponse[]> {
    const rows = await this.repo.listForStaff(courseId);
    const ids = rows.map((row) => row.id);
    const [cards, mastered, enrolledCount] = await Promise.all([
      this.repo.cardCounts(ids),
      this.repo.masteredRowCounts(courseId, ids),
      this.repo.countEnrolled(courseId),
    ]);
    return rows.map((row) => {
      const cardCount = cards.get(row.id) ?? 0;
      const possible = cardCount * enrolledCount;
      const masteredRatio =
        possible > 0 ? Math.min(1, (mastered.get(row.id) ?? 0) / possible) : 0;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        cardType: row.cardType,
        cardCount,
        weekId: row.weekId,
        weekNumber: row.weekNumber,
        draft: row.draft,
        masteredRatio,
        enrolledCount,
      };
    });
  }

  /** The course's decks for an enrolled talebe, with the caller's own progress. */
  async listForStudent(
    courseId: string,
    userId: string
  ): Promise<CourseDeckStudentResponse[]> {
    const rows = await this.repo.listForStudent(courseId, userId);
    const stats = await this.summaryRepo.findStats(
      userId,
      rows.map((row) => row.id)
    );
    return rows.map((row) => {
      const progress = stats.get(row.id);
      const cardCount = progress?.cardCount ?? 0;
      const masteredCount = progress?.masteredCount ?? 0;
      const learningCount = progress?.learningCount ?? 0;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        cardType: row.cardType,
        weekId: row.weekId,
        weekNumber: row.weekNumber,
        cardCount,
        masteredCount,
        learningCount,
        newCount: Math.max(0, cardCount - masteredCount - learningCount),
        dueCount: progress?.dueCount ?? 0,
      };
    });
  }

  /** A new course deck: the caller is its author; a draft is seen by the staff only. */
  async create(
    courseId: string,
    authorId: string,
    dto: CreateCourseDeckDto
  ): Promise<{ id: string }> {
    await this.assertWeekOfCourse(courseId, dto.weekId ?? null);
    return this.repo.insertDeck({
      authorId,
      courseId,
      title: dto.title,
      description: dto.description ?? null,
      cardType: dto.cardType,
      weekId: dto.weekId ?? null,
      courseDraft: dto.draft ?? false,
    });
  }

  async update(
    courseId: string,
    deckId: string,
    dto: UpdateCourseDeckDto
  ): Promise<CourseDeckManageResponse> {
    await this.assertDeckOfCourse(courseId, deckId);
    if (dto.weekId !== undefined) {
      await this.assertWeekOfCourse(courseId, dto.weekId);
    }
    await this.repo.updateDeck(deckId, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.weekId !== undefined && { weekId: dto.weekId }),
      ...(dto.draft !== undefined && { courseDraft: dto.draft }),
    });
    const updated = (await this.listForStaff(courseId)).find(
      (deck) => deck.id === deckId
    );
    if (!updated) throw new DeckNotFoundError(deckId);
    return updated;
  }

  /**
   * Deletes a draft deck with its cards and what the talebe made of them. A
   * published deck answers 409: the talebe lose it by a PATCH with `draft`
   * true, which keeps their progress.
   */
  async delete(courseId: string, deckId: string): Promise<void> {
    const deck = await this.assertDeckOfCourse(courseId, deckId);
    if (!deck.courseDraft) throw new CourseDeckNotDraftError(deckId);
    await this.deckService.delete(deckId);
  }

  private async assertDeckOfCourse(
    courseId: string,
    deckId: string
  ): Promise<{ courseDraft: boolean }> {
    const deck = await this.repo.findCourseDeckId(courseId, deckId);
    if (!deck) throw new DeckNotFoundError(deckId);
    return deck;
  }

  /** A week, when named, must be one of the course's shown weeks. */
  private async assertWeekOfCourse(
    courseId: string,
    weekId: string | null
  ): Promise<void> {
    if (weekId === null) return;
    if (!(await this.repo.findShownWeek(courseId, weekId))) {
      throw new CourseWeekNotInCourseError(weekId);
    }
  }
}
