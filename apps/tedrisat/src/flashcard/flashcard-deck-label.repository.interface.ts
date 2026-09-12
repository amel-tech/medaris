import { Scope } from "./domain/flashcard-label.enum";

export interface IFlashcardDeckLabel {
  id: string;
  title: string;
  createdAt: Date;
  createdBy: string;
  scope: Scope;
}

export interface ICreateFlashcardDeckLabel {
  title: string;
  scope: Scope;
  createdBy: string;
}
export interface IFlashcardDeckLabelStats {
  labelId: string;
  usageCount: number;
  lastUsedAt: Date;
}
/**
 * What the stats readers answer. The stats row is created lazily, on the first
 * labeling, so a label that exists and was never applied has no row: the
 * services answer that with zero counts and a `null` `lastUsedAt` rather than a
 * 404, which is reserved for a label that does not exist (MDRS-58 review).
 */
export interface IFlashcardDeckLabelStatsRead {
  labelId: string;
  usageCount: number;
  lastUsedAt: Date | null;
}
export interface IFlashcardDeckLabeling {
  labelId: string;
  privateToUserId: string | null;
  deckId: string;
  createdBy: string;
}
export interface IFlashcardDeckLabelRepository {
  getById(labelId: string): Promise<IFlashcardDeckLabel>;
  create(newLabel: ICreateFlashcardDeckLabel): Promise<IFlashcardDeckLabel>;
  delete(labelId: string): Promise<boolean>;

  deckLabeling(
    newLabeling: IFlashcardDeckLabeling
  ): Promise<IFlashcardDeckLabeling>;

  createLabelStats(
    useLabel: IFlashcardDeckLabelStats
  ): Promise<IFlashcardDeckLabelStats>;

  updateLabelStats(labelId: string): Promise<IFlashcardDeckLabelStats>;

  getLabelStats(labelId: string): Promise<IFlashcardDeckLabelStats | null>;
}
