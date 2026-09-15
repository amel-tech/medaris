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
  createMany(cards: ICreateFlashcard[]): Promise<IFlashcard[]>;
  update(id: string, updates: IUpdateFlashcard): Promise<IFlashcard | null>;
  delete(id: string): Promise<boolean>;

  replaceManyProgress(
    updates: ICreateFlashcardProgress[]
  ): Promise<IFlashcardProgress[]>;
}
