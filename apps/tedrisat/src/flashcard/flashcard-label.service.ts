import { Injectable } from "@nestjs/common";
import { FlashcardLabelForbiddenError } from "./errors/flashcard-label-forbidden.error";
import { FlashcardLabelNotFoundError } from "./errors/flashcard-label-not-found.error";
import { FlashcardLabelRepository } from "./flashcard-label.reporsitory";
import {
  ICreateFlashcardLabel,
  IFlashcardLabel,
  IFlashcardLabeling,
  IFlashcardLabelStats,
  IFlashcardLabelStatsRead,
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
   *
   * Both readers throw rather than resolving null (MDRS-58). They used to hand
   * `null` straight back, and the controller declared a 200 carrying a
   * `FlashcardLabelResponse`. Nest serialises `null` as an EMPTY body, so an
   * unknown id answered `200` with nothing in it while the published contract
   * promised an object. Once MDRS-58 generated a client from that contract the
   * mismatch stopped being cosmetic: `JSONApiResponse.value()` calls
   * `response.json()` on the empty body and the caller gets
   * `SyntaxError: Unexpected end of JSON input` from a method whose signature
   * says it returns a label. `GlobalExceptionFilter` turns the
   * `FlashcardLabelNotFoundError` into the 404 the controllers document.
   */
  async getById(id: string, userId: string): Promise<IFlashcardLabel> {
    await this.assertOwner(id, userId);

    // Re-checked rather than returned blind. The two reads are not atomic, so
    // a concurrent delete between them makes this one miss — and returning the
    // miss unguarded would answer 200 with an empty body, which is precisely
    // the shape this change removes. Losing the race is still a 404.
    const label = await this.flashcardLabelRepo.getById(id);
    if (!label) {
      throw new FlashcardLabelNotFoundError(id);
    }
    return label;
  }
  /**
   * Ownership is asserted against the LABEL, not the stats row. `labelStats`
   * carries no owner column of its own, and a label with no stats row yet is a
   * legitimate empty read rather than a denial — distinguishing "never used"
   * from "not yours" is precisely what the assertion is for (MDRS-56).
   *
   * The stats row is created lazily — `createLabel` inserts only the label and
   * `flashcardLabeling` adds the stats row on the first use — so a label that
   * exists and has never been applied has no row. That is answered with a
   * zero-valued stats object, not a 404: the 404 is reserved for a label that
   * does not exist (or is not the caller's, which `assertOwner` reports as
   * 403), so the generated client can tell an unused label from a deleted one
   * (MDRS-58 review). Returning `null` was not an option either — Nest
   * serialises it as an empty 200 body the generated client cannot parse.
   *
   * Whether the row is queryable at all is a separate defect: the migration
   * created `usageCount` where the schema declares `usage_count`. Follow-up 1
   * in docs/migration/mdrs-56-flashcard-label-authz.md.
   */
  async getLabelStats(
    id: string,
    userId: string
  ): Promise<IFlashcardLabelStatsRead> {
    await this.assertOwner(id, userId);
    const stats = await this.flashcardLabelRepo.getLabelStats(id);
    return stats ?? { labelId: id, usageCount: 0, lastUsedAt: null };
  }
}
