import { Injectable } from "@nestjs/common";
import { FlashcardLabelForbiddenError } from "./errors/flashcard-label-forbidden.error";
import { FlashcardLabelNotFoundError } from "./errors/flashcard-label-not-found.error";
import { FlashcardLabelRepository } from "./flashcard-label.reporsitory";
import {
  ICreateFlashcardLabel,
  IFlashcardLabel,
  IFlashcardLabeling,
  IFlashcardLabelStats,
} from "./flashcard-label.reporsitory.interface";

@Injectable()
export class FlashcardLabelService {
  constructor(private readonly flashcardLabelRepo: FlashcardLabelRepository) {}
  async createLabel(
    createLabelDto: ICreateFlashcardLabel
  ): Promise<IFlashcardLabel> {
    return await this.flashcardLabelRepo.createLabel(createLabelDto);
  }
  /**
   * Ensures the label exists and is owned by `userId`, else throws.
   *
   * Modelled on `KoskService.assertOwner`. Ownership is `userId`, the column
   * the create path fills from the verified token — NOT `createdBy`, which
   * happens to hold the same value today but is an audit field and would stop
   * matching the moment anything creates a label on another user's behalf.
   *
   * Scope is deliberately not consulted. A PUBLIC label is visible to
   * everyone but still belongs to whoever made it, and this repository has no
   * role model (no @Roles, no RolesGuard, nothing in the JWT), so there is no
   * such thing as an administrator who may delete somebody else's row. If that
   * ever changes, this is the method that learns about it.
   */
  async assertOwner(labelId: string, userId: string): Promise<void> {
    const label = await this.flashcardLabelRepo.getById(labelId);
    if (!label) {
      throw new FlashcardLabelNotFoundError(labelId);
    }
    if (label.userId !== userId) {
      throw new FlashcardLabelForbiddenError();
    }
  }

  async deleteLabel(labelId: string, userId: string): Promise<boolean> {
    await this.assertOwner(labelId, userId);
    return await this.flashcardLabelRepo.delete(labelId);
  }
  async flashcardLabeling(
    newLabeling: IFlashcardLabeling
  ): Promise<IFlashcardLabeling> {
    const labelStats = await this.flashcardLabelRepo.getLabelStats(
      newLabeling.labelId
    );
    if (labelStats) {
      await this.flashcardLabelRepo.updateLabelStats(newLabeling.labelId);
    } else {
      await this.flashcardLabelRepo.createLabelStats({
        labelId: newLabeling.labelId,
        usageCount: 1,
        lastUsedAt: new Date(),
      });
    }
    return await this.flashcardLabelRepo.flashcardLabeling(newLabeling);
  }
  async getById(id: string): Promise<IFlashcardLabel | null> {
    return await this.flashcardLabelRepo.getById(id);
  }
  async getLabelStats(id: string): Promise<IFlashcardLabelStats | null> {
    return await this.flashcardLabelRepo.getLabelStats(id);
  }
}
