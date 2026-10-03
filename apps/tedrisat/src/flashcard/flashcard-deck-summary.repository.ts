import { Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, or, SQL, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { courseMuderris, courses } from "../database/schema/course.schema";
import {
  flashcardProgress,
  flashcards,
} from "../database/schema/flashcard.schema";
import { decks, decksUsers } from "../database/schema/flashcard-deck.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import { deckSharedWith } from "./deck-sharing";
import { DeckPublishStatus } from "./domain/deck-publish-status.enum";
import { FlashcardType } from "./domain/flashcard-type.enum";

/** A deck as a list reads it: the row, where it belongs, and the caller's tie to it. */
export interface DeckListRow {
  id: string;
  title: string;
  description: string | null;
  authorId: string;
  isPublic: boolean;
  cardType: FlashcardType;
  publishStatus: DeckPublishStatus;
  publishRequestedAt: Date | null;
  courseId: string | null;
  koskId: string | null;
  madrasahId: string | null;
  courseTitle: string | null;
  koskName: string | null;
  madrasahName: string | null;
  muderrisName: string | null;
  /** When the caller collected it, or null when they have not. */
  collectedAt: Date | null;
}

/** The caller's progress through a deck's cards. */
export interface DeckProgressStats {
  cardCount: number;
  masteredCount: number;
  learningCount: number;
  addedSinceCollectedCount: number;
}

/**
 * The read side of the deck lists (MDRS-164). Everything here answers one
 * caller: visibility is part of every predicate, because a list route has no
 * single resource for `@Authz` to look at.
 */
@Injectable()
export class FlashcardDeckSummaryRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private selectRows(userId: string) {
    return this.databaseService.db
      .select({
        id: decks.id,
        title: decks.title,
        description: decks.description,
        authorId: decks.authorId,
        isPublic: decks.isPublic,
        cardType: decks.cardType,
        publishStatus: decks.publishStatus,
        publishRequestedAt: decks.publishRequestedAt,
        courseId: decks.courseId,
        koskId: decks.koskId,
        madrasahId: decks.madrasahId,
        courseTitle: courses.title,
        koskName: kosks.name,
        madrasahName: madrasahs.name,
        // The first müderris by the order the course lists them in.
        muderrisName: sql<string | null>`(
          SELECT ${courseMuderris.name}
          FROM ${courseMuderris}
          WHERE ${courseMuderris.courseId} = ${decks.courseId}
          ORDER BY ${courseMuderris.orderIndex}
          LIMIT 1
        )`,
        collectedAt: decksUsers.createdAt,
      })
      .from(decks)
      .leftJoin(courses, eq(courses.id, decks.courseId))
      .leftJoin(kosks, eq(kosks.id, decks.koskId))
      .leftJoin(madrasahs, eq(madrasahs.id, decks.madrasahId))
      .leftJoin(
        decksUsers,
        and(eq(decksUsers.deckId, decks.id), eq(decksUsers.userId, userId))
      );
  }

  /** The decks the caller wrote, newest first. A hidden deck is left out. */
  async findOwn(userId: string): Promise<DeckListRow[]> {
    return this.selectRows(userId)
      .where(and(eq(decks.authorId, userId), isNull(decks.archivedAt)))
      .orderBy(desc(decks.createdAt));
  }

  /**
   * The decks of other people the caller collected and may still read — the
   * predicate `FlashcardDeckRepository.findAllByUser` uses, so the two agree.
   */
  async findCollected(userId: string): Promise<DeckListRow[]> {
    return this.selectRows(userId)
      .where(
        and(
          ne(decks.authorId, userId),
          isNull(decks.archivedAt),
          sql`${decksUsers.userId} IS NOT NULL`,
          or(eq(decks.isPublic, true), deckSharedWith(userId))
        )
      )
      .orderBy(desc(decksUsers.createdAt));
  }

  /**
   * Keşfet's first section: private decks that belong to a course, köşk or
   * medrese the caller is enrolled in, other people's, newest first.
   */
  async findSharedWithCaller(
    userId: string,
    cardType?: FlashcardType
  ): Promise<DeckListRow[]> {
    return this.selectRows(userId)
      .where(
        and(
          eq(decks.isPublic, false),
          ne(decks.authorId, userId),
          deckSharedWith(userId),
          cardTypeIs(cardType)
        )
      )
      .orderBy(desc(decks.createdAt));
  }

  /** Keşfet's second section: every published deck, the caller's own included. */
  async findPublished(
    userId: string,
    cardType?: FlashcardType
  ): Promise<DeckListRow[]> {
    return this.selectRows(userId)
      .where(
        and(
          eq(decks.isPublic, true),
          isNull(decks.archivedAt),
          cardTypeIs(cardType)
        )
      )
      .orderBy(desc(decks.createdAt));
  }

  /** Card counts and the caller's progress, one grouped read for all `deckIds`. */
  async findStats(
    userId: string,
    deckIds: string[]
  ): Promise<Map<string, DeckProgressStats>> {
    const stats = new Map<string, DeckProgressStats>();
    if (deckIds.length === 0) return stats;

    const rows = await this.databaseService.db
      .select({
        deckId: flashcards.deckId,
        cardCount: sql<number>`count(*)`.mapWith(Number),
        masteredCount:
          sql<number>`count(*) FILTER (WHERE ${flashcardProgress.status} = 'MASTERED')`.mapWith(
            Number
          ),
        learningCount:
          sql<number>`count(*) FILTER (WHERE ${flashcardProgress.status} = 'LEARNING')`.mapWith(
            Number
          ),
        addedSinceCollectedCount:
          sql<number>`count(*) FILTER (WHERE ${flashcards.createdAt} > ${decksUsers.createdAt})`.mapWith(
            Number
          ),
      })
      .from(flashcards)
      .leftJoin(
        flashcardProgress,
        and(
          eq(flashcardProgress.flashcardId, flashcards.id),
          eq(flashcardProgress.userId, userId)
        )
      )
      .leftJoin(
        decksUsers,
        and(
          eq(decksUsers.deckId, flashcards.deckId),
          eq(decksUsers.userId, userId)
        )
      )
      .where(inArray(flashcards.deckId, deckIds))
      .groupBy(flashcards.deckId);

    for (const { deckId, ...rest } of rows) stats.set(deckId, rest);
    return stats;
  }
}

const cardTypeIs = (cardType?: FlashcardType): SQL | undefined =>
  cardType ? eq(decks.cardType, cardType) : undefined;
