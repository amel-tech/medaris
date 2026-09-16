import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import {
  deckLabelings,
  deckLabels,
  deckLabelsStats,
} from "../database/schema/flashcard-deck-label.schema";
import {
  ICreateFlashcardDeckLabel,
  IFlashcardDeckLabel,
  IFlashcardDeckLabeling,
  IFlashcardDeckLabelRepository,
  IFlashcardDeckLabelStats,
} from "./flashcard-deck-label.repository.interface";

@Injectable()
export class FlashcardDeckLabelRepository
  implements IFlashcardDeckLabelRepository
{
  constructor(private readonly databaseService: DatabaseService) {}
  async getById(tagId: string): Promise<IFlashcardDeckLabel> {
    const [result] = await this.databaseService.db
      .select()
      .from(deckLabels)
      .where(eq(deckLabels.id, tagId));
    return result;
  }

  async create(
    newTag: ICreateFlashcardDeckLabel
  ): Promise<IFlashcardDeckLabel> {
    const [created] = await this.databaseService.db
      .insert(deckLabels)
      .values(newTag)
      .returning();
    return created;
  }
  async delete(labelId: string): Promise<boolean> {
    const deleted = await this.databaseService.db
      .delete(deckLabels)
      .where(eq(deckLabels.id, labelId))
      .returning();
    return deleted.length > 0;
  }
  async deckLabeling(
    newLabeling: IFlashcardDeckLabeling
  ): Promise<IFlashcardDeckLabeling> {
    const labelingToInsert = {
      labelId: newLabeling.labelId,
      deckId: newLabeling.deckId,
      createdBy: newLabeling.createdBy,
      privateToUserId: newLabeling.privateToUserId ?? null,
    };

    const [deckLabeling] = await this.databaseService.db
      .insert(deckLabelings)
      .values(labelingToInsert)
      .returning();
    return {
      labelId: deckLabeling.labelId,
      privateToUserId: deckLabeling.privateToUserId,
      deckId: deckLabeling.deckId,
      createdBy: deckLabeling.createdBy,
    };
  }
  /**
   * The labeling and its usage counter, in one transaction.
   *
   * The three statements this replaces — read the stats row, then create or
   * increment it, then insert the labeling — ran outside any transaction, and
   * the insert is the one that can fail: `deck_labelings.deck_id` is a NOT NULL
   * foreign key, so a deck id that is not a deck answered 500 *after* the
   * counter had already moved, and the label was then reported as used once
   * with no labeling row behind it, permanently and cumulatively.
   *
   * Order matters: the labeling goes in FIRST, so a bad reference aborts before
   * anything touches the counter. The counter is then one upsert rather than a
   * read-and-branch — two concurrent first-labelings of the same label both
   * read `null` under the old shape and both inserted, which the unique index
   * on `label_id` (migration 0013) now refuses; `onConflictDoUpdate` turns that
   * race into an increment instead of an error.
   */
  async labelAndCountUsage(
    newLabeling: IFlashcardDeckLabeling
  ): Promise<IFlashcardDeckLabeling> {
    return this.databaseService.db.transaction(async (tx) => {
      const [deckLabeling] = await tx
        .insert(deckLabelings)
        .values({
          labelId: newLabeling.labelId,
          deckId: newLabeling.deckId,
          createdBy: newLabeling.createdBy,
          privateToUserId: newLabeling.privateToUserId ?? null,
        })
        .returning();

      await tx
        .insert(deckLabelsStats)
        .values({
          labelId: newLabeling.labelId,
          usageCount: 1,
          lastUsedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: deckLabelsStats.labelId,
          set: {
            usageCount: sql`${deckLabelsStats.usageCount} + 1`,
            lastUsedAt: new Date(),
          },
        });

      return {
        labelId: deckLabeling.labelId,
        privateToUserId: deckLabeling.privateToUserId,
        deckId: deckLabeling.deckId,
        createdBy: deckLabeling.createdBy,
      };
    });
  }

  async createLabelStats(
    useLabel: IFlashcardDeckLabelStats
  ): Promise<IFlashcardDeckLabelStats> {
    const cretedStats = await this.databaseService.db
      .insert(deckLabelsStats)
      .values(useLabel)
      .returning();
    return {
      labelId: cretedStats[0].labelId,
      usageCount: cretedStats[0].usageCount,
      lastUsedAt: cretedStats[0].lastUsedAt,
    };
  }
  async updateLabelStats(labelId: string): Promise<IFlashcardDeckLabelStats> {
    const cretedStats = await this.databaseService.db
      .update(deckLabelsStats)
      .set({
        usageCount: sql`${deckLabelsStats.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(deckLabelsStats.labelId, labelId))
      .returning();
    return {
      labelId: cretedStats[0].labelId,
      usageCount: cretedStats[0].usageCount,
      lastUsedAt: cretedStats[0].lastUsedAt,
    };
  }
  async getLabelStats(
    labelId: string
  ): Promise<IFlashcardDeckLabelStats | null> {
    // `deck_label_stats` holds at most one row per label, and only `stats[0]`
    // is ever read. Without LIMIT 1 the planner must scan the whole table to
    // prove there is no second match — `label_id` carries no index (a plain
    // `references()` FK; Postgres indexes only the referenced side), so the
    // common "label exists, never applied" case scanned everything to return
    // nothing. The durable fix is a unique index on the column; its blocker
    // (the column was `lable_id` in the database) is gone as of migration
    // 0013, so it is now a clean follow-up rather than an impossible one.
    const stats = await this.databaseService.db
      .select()
      .from(deckLabelsStats)
      .where(eq(deckLabelsStats.labelId, labelId))
      .limit(1);
    // `null` for a label that has never been applied — the row is created on
    // the first labeling. Dereferencing `stats[0]` here threw a TypeError on
    // that legitimate empty read; the service answers it with zero counts.
    const row = stats[0];
    if (!row) return null;
    return {
      labelId: row.labelId,
      usageCount: row.usageCount,
      lastUsedAt: row.lastUsedAt,
    };
  }
}
