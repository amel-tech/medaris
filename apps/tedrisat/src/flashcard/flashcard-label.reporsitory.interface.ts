import { Scope } from "./domain/flashcard-label.enum";

export interface IFlashcardLabel {
  id: string;
  title: string;
  scope: Scope;
  userId: string;
  createdBy: string;
}
export interface ICreateFlashcardLabel {
  title: string;
  scope: Scope;
  userId: string;
  createdBy: string;
}
export interface IFlashcardLabeling {
  labelId: string;
  privateToUserId: string | null;
  flashcardId: string;
  createdBy: string;
}
export interface IFlashcardLabelStats {
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
export interface IFlashcardLabelStatsRead {
  labelId: string;
  usageCount: number;
  lastUsedAt: Date | null;
}
export interface IFlashcardLabelRepository {
  getById(labelId: string): Promise<IFlashcardLabel | null>;
  delete(labelId: string): Promise<boolean>;
  createLabel(newlabel: ICreateFlashcardLabel): Promise<IFlashcardLabel>;
  flashcardLabeling(
    newLabeling: IFlashcardLabeling
  ): Promise<IFlashcardLabeling>;
  createLabelStats(
    newStats: IFlashcardLabelStats
  ): Promise<IFlashcardLabelStats>;
  updateLabelStats(labelId: string): Promise<IFlashcardLabelStats>;
  getLabelStats(labelId: string): Promise<IFlashcardLabelStats | null>;
}
