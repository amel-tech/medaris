import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { decks, flashcardProgress, flashcards } from "../database/schema";
import { deckSharedWith } from "./deck-sharing";
import { CardIncludeEnum } from "./domain/card-include.enum";
import {
  ICreateFlashcard,
  ICreateFlashcardProgress,
  IFlashcard,
  IFlashcardProgress,
  IFlashcardRepository,
  IFlashcardVisibility,
  IStudyCard,
  IStudyQueue,
  IUpdateFlashcard,
} from "./flashcard.repository.interface";
import { isReviewDue } from "./review-due";

/** Overrides for includes that need custom config (e.g. a where clause). */
const cardIncludeOverrides: Partial<
  Record<CardIncludeEnum, (userId: string) => unknown>
> = {
  [CardIncludeEnum.Progress]: (userId) => ({
    where: eq(flashcardProgress.userId, userId),
  }),
};

function buildWith(
  include: Set<CardIncludeEnum> | undefined,
  userId: string | null
) {
  if (!include?.size) return {};
  return Object.fromEntries(
    [...include]
      // Nobody's progress is anonymous: a caller with no token gets the cards.
      .filter((key) => userId !== null || key !== CardIncludeEnum.Progress)
      .map((key) => [
        key,
        // `userId` is non-null here whenever an override exists (Progress).
        cardIncludeOverrides[key]?.(userId as string) ?? true,
      ])
  );
}

@Injectable()
export class FlashcardRepository implements IFlashcardRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async findById(
    id: string,
    userId: string,
    include?: Set<CardIncludeEnum>
  ): Promise<IFlashcard | null> {
    const result = await this.databaseService.db.query.flashcards.findFirst({
      where: eq(flashcards.id, id),
      with: buildWith(include, userId),
    });

    return result || null;
  }

  async findByDeckId(
    deckId: string,
    userId: string | null,
    include?: Set<CardIncludeEnum>
  ): Promise<IFlashcard[]> {
    return this.databaseService.db.query.flashcards.findMany({
      where: eq(flashcards.deckId, deckId),
      with: buildWith(include, userId),
    });
  }

  async findDeckId(id: string): Promise<string | null> {
    // One column, LIMIT 1 — the same shape as
    // `FlashcardDeckRepository.findAuthorId`, for the same reason.
    const rows = await this.databaseService.db
      .select({ deckId: flashcards.deckId })
      .from(flashcards)
      .where(eq(flashcards.id, id))
      .limit(1);
    return rows[0]?.deckId ?? null;
  }

  async findVisibilityByIds(
    cardIds: string[],
    viewerId?: string
  ): Promise<IFlashcardVisibility[]> {
    // `inArray` with an empty list compiles to `in ()`, which Postgres
    // rejects — and there is nothing to ask about anyway.
    if (cardIds.length === 0) return [];

    // Four columns over a `flashcards ⋈ decks` join on the FK: the caller
    // needs the deck each card belongs to AND that deck's visibility, and
    // fetching them apart means one query for the deck ids and a second for
    // the decks. Duplicate deck rows are cheap — a study session's cards
    // share a handful of decks — and de-duplicating in SQL would cost a
    // GROUP BY to save the caller a `Map`.
    return this.databaseService.db
      .select({
        cardId: flashcards.id,
        deckId: flashcards.deckId,
        authorId: decks.authorId,
        isPublic: decks.isPublic,
        sharedWithViewer: viewerId
          ? deckSharedWith(viewerId)
          : sql<boolean>`false`,
      })
      .from(flashcards)
      .innerJoin(decks, eq(flashcards.deckId, decks.id))
      .where(inArray(flashcards.id, cardIds));
  }

  async createMany(cards: ICreateFlashcard[]): Promise<IFlashcard[]> {
    // `values([])` compiles to invalid SQL. Guarded here as well as in the
    // service so the repository is safe regardless of who calls it.
    if (cards.length === 0) return [];

    return this.databaseService.db.insert(flashcards).values(cards).returning();
  }

  async update(
    id: string,
    updates: IUpdateFlashcard
  ): Promise<IFlashcard | null> {
    return this.databaseService.db
      .update(flashcards)
      .set(updates)
      .where(eq(flashcards.id, id))
      .returning()
      .then((result) => result[0] || null);
  }

  async delete(id: string): Promise<boolean> {
    const deletedCards = await this.databaseService.db
      .delete(flashcards)
      .where(eq(flashcards.id, id))
      .returning();

    return deletedCards.length ? true : false;
  }

  // flashcard-progress

  async replaceManyProgress(
    updates: ICreateFlashcardProgress[]
  ): Promise<IFlashcardProgress[]> {
    return this.databaseService.db
      .insert(flashcardProgress)
      .values(updates)
      .onConflictDoUpdate({
        target: [flashcardProgress.userId, flashcardProgress.flashcardId],
        set: {
          status: sql.raw(`excluded.${flashcardProgress.status.name}`),
          dueAt: sql.raw(`excluded.${flashcardProgress.dueAt.name}`),
          reviewedAt: sql.raw(`excluded.${flashcardProgress.reviewedAt.name}`),
          intervalDays: sql.raw(
            `excluded.${flashcardProgress.intervalDays.name}`
          ),
        },
      })
      .returning();
  }

  async findProgress(
    userId: string,
    cardIds: string[]
  ): Promise<IFlashcardProgress[]> {
    if (cardIds.length === 0) return [];
    return this.databaseService.db
      .select()
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.userId, userId),
          inArray(flashcardProgress.flashcardId, cardIds)
        )
      );
  }

  async findStudyQueue(
    deckId: string,
    userId: string,
    limits: { due: number; fresh: number }
  ): Promise<IStudyQueue> {
    const db = this.databaseService.db;
    const select = () =>
      db
        .select({ card: flashcards, progress: flashcardProgress })
        .from(flashcards)
        .leftJoin(
          flashcardProgress,
          and(
            eq(flashcardProgress.flashcardId, flashcards.id),
            eq(flashcardProgress.userId, userId)
          )
        );
    const asStudyCard = (row: {
      card: typeof flashcards.$inferSelect;
      progress: typeof flashcardProgress.$inferSelect | null;
    }): IStudyCard => ({
      ...row.card,
      progress: row.progress ? [row.progress] : [],
    });

    const [due, fresh] = await Promise.all([
      select()
        .where(and(eq(flashcards.deckId, deckId), isReviewDue(new Date())))
        // Never-rated LEARNING rows (no due time) come first: they are the
        // oldest debt.
        .orderBy(
          sql`${flashcardProgress.dueAt} ASC NULLS FIRST`,
          asc(flashcards.createdAt),
          asc(flashcards.id)
        )
        .limit(limits.due),
      select()
        .where(
          and(
            eq(flashcards.deckId, deckId),
            sql`(${flashcardProgress.flashcardId} IS NULL OR ${flashcardProgress.status} = 'NEW')`
          )
        )
        .orderBy(asc(flashcards.createdAt), asc(flashcards.id))
        .limit(limits.fresh),
    ]);
    return { due: due.map(asStudyCard), fresh: fresh.map(asStudyCard) };
  }
}
