import { DeckPublishStatus } from "./domain/deck-publish-status.enum";
import { FlashcardType } from "./domain/flashcard-type.enum";

export interface IFlashcardDeck {
  id: string;
  authorId: string;
  title: string;
  isPublic: boolean;
  cardType: FlashcardType;
  publishStatus: DeckPublishStatus;
  publishRequestedAt: Date | null;
  tags: string[];
  courseId: string | null;
  koskId: string | null;
  madrasahId: string | null;
  createdAt: Date;
  updatedAt: Date;
  description: string | null;
}

export interface ICreateFlashcardDeck {
  authorId: string;
  title: string;
  cardType?: FlashcardType;
  tags?: string[];
  description?: string;
}

export interface IUpdateFlashcardDeck {
  title?: string;
  tags?: string[];
  description?: string;
}

export interface IFlashcardDeckFilters {
  isPublic?: boolean;
}

export interface IFlashcardDeckUserCollectionItem {
  // interface for `decks_users` table
  // referred as `collection`
  userId: string;
  deckId: string;
  createdAt: Date;
}

/** What `findOwnership` projects: enough to decide and to name the export. */
export interface IFlashcardDeckOwnership {
  authorId: string;
  title: string;
}

/**
 * What `findVisibility` projects: the two columns every access decision on a
 * deck is made from. `authorId` answers "may the caller write?" and `isPublic`
 * answers "may anyone read?"; nothing else is consulted, so nothing else is
 * fetched.
 */
export interface IFlashcardDeckVisibility {
  authorId: string;
  isPublic: boolean;
  /**
   * The deck belongs to a course, köşk or medrese the asked-about user is
   * enrolled in (`deckSharedWith`). Always false when no user was named.
   */
  sharedWithViewer: boolean;
}

export interface IFlashcardDeckRepository {
  // SELECT
  findById(id: string, include?: Set<string>): Promise<IFlashcardDeck | null>;
  /**
   * The deck's `authorId` alone, or `null` when no such deck exists. The
   * projection ownership checks read — `findById` selects every column,
   * `description` included, to answer a one-column question.
   */
  findAuthorId(id: string): Promise<string | null>;
  /**
   * The two columns the export route needs — `authorId` for the ownership
   * decision, `title` for the filename — or `null` when no such deck exists.
   */
  findOwnership(id: string): Promise<IFlashcardDeckOwnership | null>;
  /**
   * The two columns an access decision needs — `authorId` and `isPublic` — or
   * `null` when no such deck exists. The authz resolver and the read-side
   * guard both run before the handler has done any work, on every deck
   * request; neither may pay for the unbounded `description` text `findById`
   * carries back.
   */
  findVisibility(
    id: string,
    viewerId?: string
  ): Promise<IFlashcardDeckVisibility | null>;
  findAll(include?: Set<string>): Promise<IFlashcardDeck[]>;
  findAllVisibleToUser(
    userId: string,
    filters?: IFlashcardDeckFilters,
    include?: Set<string>
  ): Promise<IFlashcardDeck[]>;
  findAllByUser(userId: string): Promise<IFlashcardDeck[]>; // not by author

  // INSERT
  create(deck: ICreateFlashcardDeck): Promise<IFlashcardDeck>;
  addToUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem>;

  // UPDATE
  /**
   * Back to private whatever the status was: the owner takes a published deck
   * back. The only writer of `is_public = false` besides the başnazım's
   * unpublish, as `approve` is the only writer of `true`.
   */
  setPrivate(id: string): Promise<IFlashcardDeck | null>;
  /** PENDING with a time, or PRIVATE with none; `isPublic` is untouched. */
  setPublishRequest(
    id: string,
    publishStatus: DeckPublishStatus,
    requestedAt: Date | null
  ): Promise<IFlashcardDeck | null>;
  update(
    id: string,
    updates: IUpdateFlashcardDeck
  ): Promise<IFlashcardDeck | null>;

  // DELETE
  delete(id: string): Promise<boolean>;
  removeFromUserCollection(
    userId: string,
    deckId: string
  ): Promise<IFlashcardDeckUserCollectionItem>;
}
