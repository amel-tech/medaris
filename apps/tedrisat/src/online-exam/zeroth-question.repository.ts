import { Injectable } from "@nestjs/common";
import { asc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { courses } from "../database/schema/course.schema";
import {
  courseZerothOptions,
  courseZerothQuestions,
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

/** A course's own zeroth question, as its last save left it. */
export type ICourseZerothQuestion = IMadrasahZerothQuestion;

/** What applies to a course: its own question, else its medrese's (none for a köşk's own course). */
export interface ICourseZeroth {
  own: ICourseZerothQuestion | null;
  madrasah: IMadrasahZerothQuestion | null;
  /** False for a course of a köşk alone, which has no medrese to fall back on. */
  inMadrasah: boolean;
}

const same = (a: IZerothQuestion, b: IZerothQuestion) =>
  a.text === b.text &&
  a.options.length === b.options.length &&
  a.options.every((option, i) => option === b.options[i]);

/**
 * The zeroth question (MDRS-299): one per medrese, asked before every exam of
 * its courses, and a course's own, which it asks instead (the owner, 22 Nov
 * 2026: "medreseninki default olur ders özelinde değişebilir").
 */
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

  /** A course's own zeroth question with its options in their order; null while it has none. */
  async findForCourse(
    courseId: string,
    tx: Db | Tx = this.db
  ): Promise<ICourseZerothQuestion | null> {
    const [question] = await tx
      .select({
        text: courseZerothQuestions.text,
        updatedAt: courseZerothQuestions.updatedAt,
      })
      .from(courseZerothQuestions)
      .where(eq(courseZerothQuestions.courseId, courseId));
    if (!question) return null;
    const options = await tx
      .select({ text: courseZerothOptions.text })
      .from(courseZerothOptions)
      .where(eq(courseZerothOptions.courseId, courseId))
      .orderBy(asc(courseZerothOptions.position));
    return { ...question, options: options.map((o) => o.text) };
  }

  /**
   * The course's own question, its medrese's, and whether it has a medrese.
   * Publishing passes its transaction, so what it copies is what applies as
   * the exam is published.
   */
  async findForCourseOrMadrasah(
    courseId: string,
    tx: Db | Tx = this.db
  ): Promise<ICourseZeroth> {
    const [course] = await tx
      .select({ madrasahId: courses.madrasahId })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    const madrasahId = course?.madrasahId ?? null;
    const [own, madrasah] = await Promise.all([
      this.findForCourse(courseId, tx),
      madrasahId ? this.findForMadrasah(madrasahId, tx) : null,
    ]);
    return { own, madrasah, inMadrasah: madrasahId !== null };
  }

  /** The question an exam of the course asks: its own, else its medrese's; null when there is neither. */
  async findAsked(
    courseId: string,
    tx: Db | Tx = this.db
  ): Promise<IZerothQuestion | null> {
    const { own, madrasah } = await this.findForCourseOrMadrasah(courseId, tx);
    return own ?? madrasah;
  }

  /**
   * Replaces the course's own question and all its options. Written to
   * `audit_log` as `course.zeroth_question.update` with what it was and what
   * it is; a save that changes nothing writes nothing.
   */
  async replaceForCourse(
    courseId: string,
    input: IZerothQuestion,
    actorId: string
  ): Promise<ICourseZerothQuestion> {
    return this.db.transaction(async (tx) => {
      // Held to the end, so two saves at once land one after the other.
      await tx
        .select({ id: courseZerothQuestions.courseId })
        .from(courseZerothQuestions)
        .where(eq(courseZerothQuestions.courseId, courseId))
        .for("update");
      const before = await this.findForCourse(courseId, tx);
      if (before && same(before, input)) return before;

      const [saved] = await tx
        .insert(courseZerothQuestions)
        .values({ courseId, text: input.text, updatedBy: actorId })
        .onConflictDoUpdate({
          target: courseZerothQuestions.courseId,
          set: { text: input.text, updatedBy: actorId, updatedAt: sql`now()` },
        })
        .returning({ updatedAt: courseZerothQuestions.updatedAt });
      await tx
        .delete(courseZerothOptions)
        .where(eq(courseZerothOptions.courseId, courseId));
      await tx
        .insert(courseZerothOptions)
        .values(
          input.options.map((text, position) => ({ courseId, position, text }))
        );
      await tx.insert(auditLog).values({
        actorId,
        action: "course.zeroth_question.update",
        entity: "course",
        entityId: courseId,
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

  /**
   * Takes the course's own question off, so its exams ask the medrese's again.
   * Written to `audit_log` as `course.zeroth_question.delete` with what it
   * was; nothing is written when the course had none.
   */
  async removeForCourse(courseId: string, actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: courseZerothQuestions.courseId })
        .from(courseZerothQuestions)
        .where(eq(courseZerothQuestions.courseId, courseId))
        .for("update");
      const before = await this.findForCourse(courseId, tx);
      if (!before) return;
      // Its options go with it (ON DELETE CASCADE).
      await tx
        .delete(courseZerothQuestions)
        .where(eq(courseZerothQuestions.courseId, courseId));
      await tx.insert(auditLog).values({
        actorId,
        action: "course.zeroth_question.delete",
        entity: "course",
        entityId: courseId,
        details: { before: { text: before.text, options: before.options } },
      });
    });
  }
}
