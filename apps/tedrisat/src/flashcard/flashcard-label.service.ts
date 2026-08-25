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
  /**
   * Both readers throw rather than resolving null (MDRS-58).
   *
   * They used to hand `null` straight back, and the controller declared a 200
   * carrying a `FlashcardLabelResponse`. Nest serialises `null` as an EMPTY
   * body, so an unknown id answered `200` with nothing in it while the
   * published contract promised an object. Once MDRS-58 generated a client from
   * that contract the mismatch stopped being cosmetic: `JSONApiResponse.value()`
   * calls `response.json()` on the empty body and the caller gets
   * `SyntaxError: Unexpected end of JSON input` from a method whose signature
   * says it returns a label.
   *
   * Throwing `FlashcardLabelNotFoundError` is what `assertOwner` above already
   * does for the same missing row, and what KoskService and CourseService do
   * throughout; `GlobalExceptionFilter` turns it into the 404 the controllers
   * now document.
   */
  async getById(id: string): Promise<IFlashcardLabel> {
    const label = await this.flashcardLabelRepo.getById(id);
    if (!label) {
      throw new FlashcardLabelNotFoundError(id);
    }
    return label;
  }
  async getLabelStats(id: string): Promise<IFlashcardLabelStats> {
    const stats = await this.flashcardLabelRepo.getLabelStats(id);
    if (!stats) {
      throw new FlashcardLabelNotFoundError(id);
    }
    return stats;
  }
}
