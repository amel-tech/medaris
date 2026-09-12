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
   *
   * Non-nullable for the same reason as its twin: `assertOwner` plus the guard
   * below leave no path that returns `null`. `getDeckLabelStats` keeps its
   * `| null` — see the note on that method for why it stays.
   */
  async getById(id: string, userId: string): Promise<IFlashcardDeckLabel> {
    await this.assertOwner(id, userId);

    // Same guard as `FlashcardLabelService.getById`, and load-bearing for the
    // same second reason as the one in `assertOwner` above: this repository's
    // `getById` destructures `[result]` and is typed non-null, so a row
    // deleted between the two reads arrives here as `undefined` while the type
    // claims otherwise. Unguarded that is a 200 with an empty body.
    const label = await this.labelRepository.getById(id);
    if (!label) {
      throw new FlashcardDeckLabelNotFoundError(id);
    }
    return label;
  }
  /**
   * Ownership is asserted against the deck LABEL, because `deckLabelsStats`
   * has no owner column of its own.
   *
   * The `| null` below is currently unreachable, and deliberately left alone.
   * `FlashcardDeckLabelRepository.getLabelStats` reads `stats[0].labelId` with
   * no empty guard, so a label that has never been applied would throw rather
   * than return null — except that it never gets that far, because
   * `deck_label_stats` is unqueryable in the first place (the migration
   * created `lable_id`, the schema declares `label_id`). Both defects are one
   * follow-up, recorded in docs/migration/mdrs-56-flashcard-label-authz.md;
   * neither is fixable here, since the drift means a guard added today could
   * not be exercised by any test. What MDRS-56 owes this route is that
   * authorization is not what stops the caller, and that is asserted.
   */
  async getDeckLabelStats(
    id: string,
    userId: string
  ): Promise<IFlashcardDeckLabelStats | null> {
    await this.assertOwner(id, userId);
    return await this.labelRepository.getLabelStats(id);
  }
}
