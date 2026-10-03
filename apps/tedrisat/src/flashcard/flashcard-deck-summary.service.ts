import { Injectable } from "@nestjs/common";
import { FlashcardType } from "./domain/flashcard-type.enum";
import {
  DeckCollectionKind,
  DeckSource,
  FlashcardDeckExploreResponse,
  FlashcardDeckSummaryResponse,
} from "./dto/flashcard-deck-summary-response.dto";
import {
  DeckListRow,
  DeckProgressStats,
  FlashcardDeckSummaryRepository,
} from "./flashcard-deck-summary.repository";

const NO_PROGRESS: DeckProgressStats = {
  cardCount: 0,
  masteredCount: 0,
  learningCount: 0,
  dueCount: 0,
  addedSinceCollectedCount: 0,
};

/** Where a deck of somebody else's comes from, most specific link first. */
export const collectionKindOf = (
  row: Pick<DeckListRow, "courseId" | "koskId" | "madrasahId">
): DeckCollectionKind => {
  if (row.courseId) return DeckCollectionKind.COURSE;
  if (row.koskId) return DeckCollectionKind.KOSK;
  if (row.madrasahId) return DeckCollectionKind.MADRASAH;
  return DeckCollectionKind.PUBLIC;
};

/** One list row and the caller's progress, as the API answers it. */
export const toDeckSummary = (
  row: DeckListRow,
  stats: DeckProgressStats | undefined,
  userId: string
): FlashcardDeckSummaryResponse => {
  const progress = stats ?? NO_PROGRESS;
  const isMine = row.authorId === userId;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authorId: row.authorId,
    isMine,
    cardType: row.cardType,
    publishStatus: row.publishStatus,
    publishRequestedAt: row.publishRequestedAt,
    source: isMine ? DeckSource.OWN : DeckSource.COLLECTION,
    collectionKind: isMine ? null : collectionKindOf(row),
    inCollection: row.collectedAt !== null,
    contextTitle: row.courseTitle ?? row.koskName ?? row.madrasahName ?? null,
    muderrisName: row.courseId ? row.muderrisName : null,
    cardCount: progress.cardCount,
    masteredCount: progress.masteredCount,
    learningCount: progress.learningCount,
    newCount: Math.max(
      0,
      progress.cardCount - progress.masteredCount - progress.learningCount
    ),
    dueCount: progress.dueCount,
    addedSinceCollectedCount: isMine ? 0 : progress.addedSinceCollectedCount,
  };
};

@Injectable()
export class FlashcardDeckSummaryService {
  constructor(private readonly repo: FlashcardDeckSummaryRepository) {}

  /** The Desteler page: the caller's own decks, then the collected ones. */
  async summarize(userId: string): Promise<FlashcardDeckSummaryResponse[]> {
    const [own, collected] = await Promise.all([
      this.repo.findOwn(userId),
      this.repo.findCollected(userId),
    ]);
    return this.withProgress(userId, [...own, ...collected]);
  }

  /** The Keşfet page: the caller's courses' decks, then the published ones. */
  async explore(
    userId: string,
    cardType?: FlashcardType
  ): Promise<FlashcardDeckExploreResponse> {
    const [shared, published] = await Promise.all([
      this.repo.findSharedWithCaller(userId, cardType),
      this.repo.findPublished(userId, cardType),
    ]);
    const all = await this.withProgress(userId, [...shared, ...published]);
    return {
      courseDecks: all.slice(0, shared.length),
      publicDecks: all.slice(shared.length),
    };
  }

  /**
   * Ana sayfa's "Bugün çalışılacak desteler" (MDRS-165): the decks of the
   * caller's collection with something to study today. A deck with cards
   * waiting for a repeat comes first, the most waiting first; then the decks
   * of other people that grew since the caller collected them ("N yeni kart").
   * A deck of the caller's own with nothing due is not listed: they wrote it,
   * so "new" is not news.
   */
  async dueToday(
    userId: string,
    limit: number
  ): Promise<FlashcardDeckSummaryResponse[]> {
    const all = await this.summarize(userId);
    const waiting = all
      .filter((deck) => deck.dueCount > 0)
      .sort((a, b) => b.dueCount - a.dueCount);
    const grown = all.filter(
      (deck) =>
        deck.dueCount === 0 && !deck.isMine && deck.addedSinceCollectedCount > 0
    );
    return [...waiting, ...grown].slice(0, limit);
  }

  private async withProgress(
    userId: string,
    rows: DeckListRow[]
  ): Promise<FlashcardDeckSummaryResponse[]> {
    const stats = await this.repo.findStats(
      userId,
      rows.map((row) => row.id)
    );
    return rows.map((row) => toDeckSummary(row, stats.get(row.id), userId));
  }
}
