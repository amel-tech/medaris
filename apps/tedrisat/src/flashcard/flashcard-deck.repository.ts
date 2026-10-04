import { Injectable } from "@nestjs/common";
import { and, eq, exists, or, SQL, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { decks, decksUsers } from "../database/schema/flashcard-deck.schema";
import { deckSharedWith } from "./deck-sharing";
import { DeckPublishStatus } from "./domain/deck-publish-status.enum";
import {
  ICreateFlashcardDeck,
  IFlashcardDeck,
  IFlashcardDeckFilters,
  IFlashcardDeckOwnership,
  IFlashcardDeckRepository,
  IFlashcardDeckUserCollectionItem,
  IFlashcardDeckVisibility,
  IUpdateFlashcardDeck,
} from "./flashcard-deck.repository.interface";

/** What a new request or a change of visibility wipes: the last reviewer's answer (MDRS-180). */
const CLEARED_DECISION = {
  publishDecidedAt: null,
  publishDecidedBy: null,
  publishRejectReason: null,
} as const;

@Injectable()
export class FlashcardDeckRepository implements IFlashcardDeckRepository {
  private readonly includeMap: Record<string, Record<string, any>> = {
    // matching keys are replaced with their content to populate "with" field in db.query API
  } as const;

  constructor(private readonly databaseService: DatabaseService) {}

  async findByFilter(
    filter: SQL,
    include?: Set<string>
  ): Promise<IFlashcardDeck[]> {
    const withClause: Record<string, any> = {};

    if (include) {
      for (const relation of include) {
        const relationConfig = this.includeMap[relation];
        if (relationConfig) {
          Object.assign(withClause, relationConfig);
        }
      }
    }

    return this.databaseService.db.query.decks.findMany({
      where: filter,
      with: withClause,
    });
  }

  async findById(
    id: string,
    include?: Set<string>
  ): Promise<IFlashcardDeck | null> {
    return this.findByFilter(eq(decks.id, id), include).then(
      (result) => result[0] || null
    );
  }

  async findAuthorId(id: string): Promise<string | null> {
    // The same shape as KoskRepository.findOwnerId: one column, LIMIT 1.
    const rows = await this.databaseService.db
      .select({ authorId: decks.authorId })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return rows[0]?.authorId ?? null;
  }

  async findOwnership(id: string): Promise<IFlashcardDeckOwnership | null> {
    const rows = await this.databaseService.db
      .select({ authorId: decks.authorId, title: decks.title })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findVisibility(
    id: string,
    viewerId?: string
  ): Promise<IFlashcardDeckVisibility | null> {
    const rows = await this.databaseService.db
      .select({
        authorId: decks.authorId,
        isPublic: decks.isPublic,
        sharedWithViewer: viewerId
          ? deckSharedWith(viewerId)
          : sql<boolean>`false`,
      })
      .from(decks)
      .where(eq(decks.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findAll(include?: Set<string>): Promise<IFlashcardDeck[]> {
    // TODO: handle pagination
    return this.findByFilter(eq(decks.isPublic, true), include);
  }

  async findAllVisibleToUser(
    userId: string,
    filters?: IFlashcardDeckFilters,
    include?: Set<string>
  ): Promise<IFlashcardDeck[]> {
    // TODO: handle pagination
    const { isPublic } = filters ?? {};

    let where: SQL;
    if (isPublic === true) {
      where = eq(decks.isPublic, true);
    } else if (isPublic === false) {
      where = and(eq(decks.authorId, userId), eq(decks.isPublic, false))!;
    } else {
      where = or(eq(decks.isPublic, true), eq(decks.authorId, userId))!;
    }

    return this.findByFilter(where, include);
  }

  async findAllByUser(userId: string): Promise<IFlashcardDeck[]> {
    return this.databaseService.db.query.decks.findMany({
      // No `with: { decksUsers: true }`. The relation was hydrated in full and
      // serialized straight onto the wire — tedrisat registers no
      // `ClassSerializerInterceptor` and `FlashcardDeckResponse` has no
      // `decksUsers` field to strip it — so every collector's Keycloak `sub`
      // came back to anyone who collected the same public deck. Nothing reads
      // it: the caller's own membership is what the `exists(...)` below
      // answers. A later caller that genuinely needs the rows should scope
      // them to the caller rather than restore this.
      //
      // It was also the wrong shape to pay for: the composite primary key is
      // `(userId, deckId)`, so the deckId-leading probe drizzle emits for the
      // relation has no usable index.
      // Visibility is re-evaluated on every read, not decided once when the
      // `decks_users` row was written. `FlashcardDeckController.addToUserCollection`
      // asserts readability before it collects, but that assertion ages: the
      // author may flip a collected deck to private afterwards, and rows
      // written before that assertion existed point wherever they were allowed
      // to. The predicate is `findAllVisibleToUser`'s, so the two list routes
      // answer the same question about the same rows.
      where: and(
        or(
          eq(decks.isPublic, true),
          eq(decks.authorId, userId),
          deckSharedWith(userId)
        ),
        exists(
          // using simple `eq(decksUsers.userId, userId)` instead of `exists(...)` causes bug in drizzle
          this.databaseService.db
            .select()
            .from(decksUsers)
            .where(
              and(
                eq(decksUsers.deckId, decks.id),
                eq(decksUsers.userId, userId)
              )
            )
        )
      ),
    });
  }

  async create(newDeck: ICreateFlashcardDeck): Promise<IFlashcardDeck> {
    // Always private (MDRS-148): `approve` in `DeckReviewRepository` is the
    // only writer of a public deck.
    const [createdDeck] = await this.databaseService.db
      .insert(decks)
      .values({
        ...newDeck,
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
      })
      .returning();
    return createdDeck;
  }

  async addToUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem> {
    // Collecting twice is not an error (MDRS-164): a double click, or a page
    // that was stale when it was clicked. The row that is already there is the
    // answer, and its `createdAt` stays the day the deck was first collected.
    const [createdUser] = await this.databaseService.db
      .insert(decksUsers)
      .values({ userId, deckId })
      .onConflictDoNothing()
      .returning();
    if (createdUser) return createdUser;
    const [existing] = await this.databaseService.db
      .select()
      .from(decksUsers)
      .where(and(eq(decksUsers.userId, userId), eq(decksUsers.deckId, deckId)));
    return existing;
  }

  async update(
    id: string,
    updates: IUpdateFlashcardDeck
  ): Promise<IFlashcardDeck | null> {
    // Unfiltered on purpose: the caller's right to write this row is settled
    // at the HTTP edge by `FlashcardDeckService.assertOwner`, the same place
    // the deck-scoped card routes settle it (MDRS-63), and MDRS-43 replaces
    // that with `@Authz`. Adding an `authorId` predicate here would turn a
    // permission failure into a silent no-op instead of a 403.
    return this.databaseService.db
      .update(decks)
      .set(updates)
      .where(eq(decks.id, id))
      .returning()
      .then((result) => result[0] || null);
  }

  async setPrivate(id: string): Promise<IFlashcardDeck | null> {
    // Not `updatedAt`, as `setPublishRequest`: the deck was not edited. The
    // two columns are one fact written twice; see `DeckPublishStatus`.
    return this.databaseService.db
      .update(decks)
      .set({
        isPublic: false,
        publishStatus: DeckPublishStatus.PRIVATE,
        publishRequestedAt: null,
        ...CLEARED_DECISION,
      })
      .where(eq(decks.id, id))
      .returning()
      .then((result) => result[0] || null);
  }

  async setPublishRequest(
    id: string,
    publishStatus: DeckPublishStatus,
    requestedAt: Date | null,
    from: DeckPublishStatus
  ): Promise<IFlashcardDeck | null> {
    // Not `updatedAt`: asking for a review does not edit the deck. Guarded on
    // the status the caller read, in the same statement: the başnazım's
    // approve can land between the caller's read and this write, and an
    // unguarded write would then leave `is_public = true` under a status that
    // is not PUBLISHED, which nobody could take down.
    return this.databaseService.db
      .update(decks)
      .set({
        publishStatus,
        publishRequestedAt: requestedAt,
        ...CLEARED_DECISION,
      })
      .where(and(eq(decks.id, id), eq(decks.publishStatus, from)))
      .returning()
      .then((result) => result[0] || null);
  }

  async delete(id: string): Promise<boolean> {
    const deletedDecks = await this.databaseService.db
      .delete(decks)
      .where(eq(decks.id, id))
      .returning();

    return deletedDecks.length ? true : false;
  }

  async removeFromUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem> {
    const [deletedUser] = await this.databaseService.db
      .delete(decksUsers)
      .where(and(eq(decksUsers.userId, userId), eq(decksUsers.deckId, deckId)))
      .returning();
    return deletedUser;
  }
}
