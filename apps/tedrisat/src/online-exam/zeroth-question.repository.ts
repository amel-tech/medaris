import { Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  madrasahZerothOptions,
  madrasahZerothQuestions,
} from "../database/schema/online-exam.schema";

type Db = DatabaseService["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A zeroth question as it is asked: the text and its options in their order. */
export interface IZerothQuestion {
  text: string;
  options: string[];
}

export interface IMadrasahZerothQuestion extends IZerothQuestion {
  updatedAt: Date;
}

const same = (a: IZerothQuestion, b: IZerothQuestion) =>
  a.text === b.text &&
  a.options.length === b.options.length &&
  a.options.every((option, i) => option === b.options[i]);

/** A medrese's zeroth question (MDRS-299): one per medrese, asked before every exam of its courses. */
@Injectable()
export class ZerothQuestionRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db(): Db {
    return this.databaseService.db;
  }

  /**
   * The medrese's zeroth question with its options in their order; null
   * while it has none. Publishing an exam passes its transaction, so the
   * question it copies is the one it publishes with.
   */
  async findForMadrasah(
    madrasahId: string,
    tx: Db | Tx = this.db
  ): Promise<IMadrasahZerothQuestion | null> {
    const [question] = await tx
      .select({
        text: madrasahZerothQuestions.text,
        updatedAt: madrasahZerothQuestions.updatedAt,
      })
      .from(madrasahZerothQuestions)
      .where(eq(madrasahZerothQuestions.madrasahId, madrasahId));
    if (!question) return null;
    const options = await tx
      .select({ text: madrasahZerothOptions.text })
      .from(madrasahZerothOptions)
      .where(eq(madrasahZerothOptions.madrasahId, madrasahId))
      .orderBy(asc(madrasahZerothOptions.position));
    return { ...question, options: options.map((o) => o.text) };
  }

  /**
   * Replaces the medrese's question and all its options. Written to
   * `audit_log` as `madrasah.zeroth_question.update` with what it was and
   * what it is; a save that changes nothing writes nothing.
   */
  async replace(
    madrasahId: string,
    input: IZerothQuestion,
    actorId: string
  ): Promise<IMadrasahZerothQuestion> {
    return this.db.transaction(async (tx) => {
      // Held to the end, so two saves at once land one after the other.
      await tx
        .select({ id: madrasahZerothQuestions.madrasahId })
        .from(madrasahZerothQuestions)
        .where(eq(madrasahZerothQuestions.madrasahId, madrasahId))
        .for("update");
      const before = await this.findForMadrasah(madrasahId, tx);
      if (before && same(before, input)) return before;

      const [saved] = await tx
        .insert(madrasahZerothQuestions)
        .values({ madrasahId, text: input.text, updatedBy: actorId })
        .onConflictDoUpdate({
          target: madrasahZerothQuestions.madrasahId,
          set: { text: input.text, updatedBy: actorId, updatedAt: sql`now()` },
        })
        .returning({ updatedAt: madrasahZerothQuestions.updatedAt });
      await tx
        .delete(madrasahZerothOptions)
        .where(eq(madrasahZerothOptions.madrasahId, madrasahId));
      await tx.insert(madrasahZerothOptions).values(
        input.options.map((text, position) => ({
          madrasahId,
          position,
          text,
        }))
      );
      await tx.insert(auditLog).values({
        actorId,
        action: "madrasah.zeroth_question.update",
        entity: "madrasah",
        entityId: madrasahId,
        details: {
          before: before
            ? { text: before.text, options: before.options }
            : null,
          after: { text: input.text, options: input.options },
        },
      });
      return { ...input, updatedAt: saved.updatedAt };
    });
  }
}
