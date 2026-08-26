import { Injectable } from "@nestjs/common";
import { FlashcardDeckLabelForbiddenError } from "./errors/flashcard-deck-label-forbidden.error";
import { FlashcardDeckLabelNotFoundError } from "./errors/flashcard-deck-label-not-found.error";
import { FlashcardDeckLabelRepository } from "./flashcard-deck-label.repository";
import {
  ICreateFlashcardDeckLabel,
  IFlashcardDeckLabel,
  IFlashcardDeckLabeling,
  IFlashcardDeckLabelStats,
} from "./flashcard-deck-label.repository.interface";

@Injectable()
export class FlashcardDeckLabelService {
  constructor(private readonly labelRepository: FlashcardDeckLabelRepository) {}
  async createLabel(
    createTagDto: ICreateFlashcardDeckLabel
  ): Promise<IFlashcardDeckLabel> {
    return await this.labelRepository.create(createTagDto);
  }
  /**
   * Ensures the deck label exists and is owned by `userId`, else throws.
   *
   * `deckLabels` has no `userId` column — only `createdBy` — so that is the
   * ownership field here, unlike `FlashcardLabelService.assertOwner`. The two
   * are deliberately not unified: they read different columns because the two
   * tables genuinely differ.
   *
   * The `!label` guard is load-bearing despite `getById` being typed
   * `Promise<IFlashcardDeckLabel>`. It destructures `[result]` out of a
   * drizzle select, so a miss yields `undefined` at runtime while the type
   * says otherwise; without the guard a missing row would read `undefined`
   * off it and throw a TypeError as a 500 instead of an honest 404.
   */
  async assertOwner(labelId: string, userId: string): Promise<void> {
    const label = await this.labelRepository.getById(labelId);
    if (!label) {
      throw new FlashcardDeckLabelNotFoundError(labelId);
    }
    if (label.createdBy !== userId) {
      throw new FlashcardDeckLabelForbiddenError();
    }
  }

  async deleteLabel(labelId: string, userId: string): Promise<boolean> {
    await this.assertOwner(labelId, userId);
    return await this.labelRepository.delete(labelId);
  }
  async deckLabeling(
    newLabeling: IFlashcardDeckLabeling
  ): Promise<IFlashcardDeckLabeling> {
    const labelStats = await this.labelRepository.getLabelStats(
      newLabeling.labelId
    );
    if (labelStats) {
      await this.labelRepository.updateLabelStats(newLabeling.labelId);
    } else {
      await this.labelRepository.createLabelStats({
        labelId: newLabeling.labelId,
        usageCount: 1,
        lastUsedAt: new Date(),
      });
    }
    return await this.labelRepository.deckLabeling(newLabeling);
  }
  /**
   * MDRS-56, same shape as `FlashcardLabelService.getById` — `assertOwner`
   * first, so an id belonging to somebody else is a 403 and a missing one a
   * 404 instead of a 200 carrying another user's row.
   */
  async getById(
    id: string,
    userId: string
  ): Promise<IFlashcardDeckLabel | null> {
    await this.assertOwner(id, userId);
    return await this.labelRepository.getById(id);
  }
  /**
   * Ownership is asserted against the deck LABEL: `deckLabelsStats` has no
   * owner column, and a label that has never been applied legitimately has no
   * stats row at all.
   */
  async getDeckLabelStats(
    id: string,
    userId: string
  ): Promise<IFlashcardDeckLabelStats | null> {
    await this.assertOwner(id, userId);
    return await this.labelRepository.getLabelStats(id);
  }
}
