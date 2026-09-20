export interface IFlashcardDeck {
  id: string;
  authorId: string;
  title: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  description: string | null;
}

export interface ICreateFlashcardDeck {
  authorId: string;
  title: string;
  isPublic: boolean;
  description?: string;
}

export interface IUpdateFlashcardDeck {
  title?: string;
  isPublic?: boolean;
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
  findVisibility(id: string): Promise<IFlashcardDeckVisibility | null>;
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
