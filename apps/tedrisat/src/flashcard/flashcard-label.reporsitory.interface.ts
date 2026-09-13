import { Scope } from "./domain/flashcard-label.enum";
import { ILabelStatsRead } from "./domain/label-stats";

export interface IFlashcardLabel {
  id: string;
  title: string;
  scope: Scope;
  userId: string;
  createdBy: string;
  createdAt: Date;
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
/** See `domain/label-stats.ts` — one definition behind both services' readers. */
export type IFlashcardLabelStatsRead = ILabelStatsRead;
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
