import { CardIncludeEnum } from "./domain/card-include.enum";
import { FlashcardProgressStatus } from "./domain/flashcard-progress-status.enum";
import { FlashcardType } from "./domain/flashcard-type.enum";

export interface IFlashcard {
  id: string;
  deckId: string;
  authorId: string;
  type: FlashcardType;
  contentFront: string;
  contentBack: string;
  contentMeta: unknown;
  createdAt: Date;
  updatedAt: Date;
  progress?: IFlashcardProgress[];
}

export interface ICreateFlashcard {
  deckId: string;
  authorId: string;
  type: FlashcardType;
  contentFront: string;
  contentBack: string;
  contentMeta?: unknown;
}

export interface IUpdateFlashcard {
  type?: FlashcardType;
  contentFront?: string;
  contentBack?: string;
  contentMeta?: unknown;
}

export interface IFlashcardProgress {
  userId: string;
  flashcardId: string;
  status: FlashcardProgressStatus;
  // this will potentially be extended
}

export interface ICreateFlashcardProgress {
  userId: string;
  flashcardId: string;
  status: FlashcardProgressStatus;
}

/**
 * One card's access facts: its parent deck and the two columns that deck's
 * visibility rule reads. Shaped for a batch check, so it carries `cardId`
 * — the caller has to map an answer back to the id it asked about.
 */
export interface IFlashcardVisibility {
  cardId: string;
  deckId: string;
  authorId: string;
  isPublic: boolean;
}

export interface IFlashcardRepository {
  findById(
    id: string,
    userId: string,
    include?: Set<CardIncludeEnum>
  ): Promise<IFlashcard | null>;
  findByDeckId(
    deckId: string,
    userId: string,
    include?: Set<CardIncludeEnum>
  ): Promise<IFlashcard[] | null>;
  /**
   * The parent deck's id alone, or `null` when no such card exists. Every
   * access decision on a card is a decision about its deck, and this is the
   * projection that answers it without carrying `contentFront`/`contentBack`
   * back just to reach one foreign key.
   */
  findDeckId(id: string): Promise<string | null>;
  /**
   * The access columns for MANY cards at once: each card's parent deck plus
   * that deck's `authorId`/`isPublic`, in ONE round trip.
   *
   * `findDeckId` answers the same question for a single card, and a caller
   * with a list of ids can loop it — `PUT /flashcard/cards/progress` did,
   * two queries per distinct card in a study session. Rows missing from the
   * result are cards that do not exist; the caller decides whether that is a
   * 404 or a deny, because this projection deliberately does not.
   */
  findVisibilityByIds(cardIds: string[]): Promise<IFlashcardVisibility[]>;
  createMany(cards: ICreateFlashcard[]): Promise<IFlashcard[]>;
  update(id: string, updates: IUpdateFlashcard): Promise<IFlashcard | null>;
  delete(id: string): Promise<boolean>;

  replaceManyProgress(
    updates: ICreateFlashcardProgress[]
  ): Promise<IFlashcardProgress[]>;
}
