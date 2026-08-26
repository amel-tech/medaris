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
   *
   * MDRS-56 made this the gate for the two READ routes as well, so the same
   * scope decision now governs reads — see the controller comment for why.
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
   * MDRS-56. Both reads go through `assertOwner` first, exactly as
   * `deleteLabel` does: 404 for a label that does not exist, 403 for one that
   * belongs to somebody else. Before this the id went straight to
   * `select ... where id = ?`, so any authenticated caller who guessed a UUID
   * read another user's label — title, scope and usage count included.
   *
   * `userId` is not optional on purpose. An overload that skips the check when
   * the caller is omitted is exactly how the delete hole survived review.
   *
   * `getById` therefore reads the row twice — once inside `assertOwner`, once
   * to return it. Deliberate. Threading the checked row out of `assertOwner`
   * would save one primary-key lookup at the cost of changing the signature of
   * the method that also guards DELETE, and this issue is not the place to
   * widen the blast radius of an authorization change. Revisit it when
   * MDRS-41's policy layer replaces this method wholesale.
   */
  async getById(id: string, userId: string): Promise<IFlashcardLabel | null> {
    await this.assertOwner(id, userId);
    return await this.flashcardLabelRepo.getById(id);
  }
  /**
   * Ownership is asserted against the LABEL, not the stats row. `labelStats`
   * carries no owner column of its own, and a label with no stats row yet is a
   * legitimate 200-with-null — distinguishing "never used" from "not yours"
   * is precisely what the assertion is for.
   */
  async getLabelStats(
    id: string,
    userId: string
  ): Promise<IFlashcardLabelStats | null> {
    await this.assertOwner(id, userId);
    return await this.flashcardLabelRepo.getLabelStats(id);
  }
}
