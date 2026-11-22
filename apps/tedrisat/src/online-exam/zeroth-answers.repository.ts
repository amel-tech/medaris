import { ASSIGNED_ROLES, SCOPE_TYPES } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  type SQL,
} from "drizzle-orm";
import { grantHeld } from "../assignment/assignment.repository";
import { DatabaseService } from "../database/database.service";
import { isHeld } from "../database/role-assignments";
import { auditLog } from "../database/schema/audit.schema";
import { courses, lessons } from "../database/schema/course.schema";
import { zerothAnswers } from "../database/schema/exam-attempt.schema";
import { kosks } from "../database/schema/kosk.schema";
import { madrasahs } from "../database/schema/madrasah.schema";
import {
  onlineExams,
  zerothOptions,
} from "../database/schema/online-exam.schema";
import { permissionGrants } from "../database/schema/permission.schema";
import { roleAssignments } from "../database/schema/role-assignment.schema";

type Db = DatabaseService["db"];

/** Where and when: every field narrows; `koskIds` null is every köşk. */
export interface IZerothFilter {
  from: Date;
  to: Date;
  koskIds: readonly string[] | null;
  madrasahId?: string;
  courseId?: string;
}

/** A published exam that asked a zeroth question, with its options and their counts. */
export interface IZerothExamRow {
  examId: string;
  question: string;
  courseTitle: string;
  koskName: string;
  startsAt: Date;
  options: Array<{ text: string; count: number }>;
}

/** A course that held a published online exam: the filters' choices. */
export interface IZerothCourseRow {
  courseId: string;
  courseTitle: string;
  koskId: string;
  koskName: string;
  madrasahId: string | null;
  madrasahName: string | null;
}

/**
 * The reads behind nizam's "Sıfırıncı soru cevapları" (MDRS-299). Counts
 * only: no user id ever leaves this file, and the zeroth answers are read as
 * a count per option.
 */
@Injectable()
export class ZerothAnswersRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db(): Db {
    return this.databaseService.db;
  }

  private placeOf(filter: Omit<IZerothFilter, "from" | "to">): SQL[] {
    return [
      ...(filter.koskIds ? [inArray(courses.koskId, [...filter.koskIds])] : []),
      ...(filter.madrasahId ? [eq(courses.madrasahId, filter.madrasahId)] : []),
      ...(filter.courseId ? [eq(courses.id, filter.courseId)] : []),
    ];
  }

  /**
   * The published exams whose celse falls in the span and the place, newest
   * first, each with its zeroth question, its options in their order and how
   * many talebe chose each. An exam published with no zeroth question is left
   * out: it asked nothing.
   */
  async exams(filter: IZerothFilter): Promise<IZerothExamRow[]> {
    if (filter.koskIds?.length === 0) return [];
    const exams = await this.db
      .select({
        examId: onlineExams.id,
        question: onlineExams.zerothQuestion,
        courseTitle: courses.title,
        koskName: kosks.name,
        startsAt: lessons.scheduledAt,
      })
      .from(onlineExams)
      .innerJoin(lessons, eq(lessons.id, onlineExams.lessonId))
      .innerJoin(courses, eq(courses.id, onlineExams.courseId))
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .where(
        and(
          isNotNull(onlineExams.publishedAt),
          isNotNull(lessons.scheduledAt),
          gte(lessons.scheduledAt, filter.from),
          lte(lessons.scheduledAt, filter.to),
          ...this.placeOf(filter)
        )
      )
      .orderBy(asc(lessons.scheduledAt), asc(onlineExams.id));
    const asked = exams.filter((exam) => exam.question.trim() !== "");
    if (asked.length === 0) return [];
    const ids = asked.map((exam) => exam.examId);

    const [options, counts] = await Promise.all([
      this.db
        .select({
          id: zerothOptions.id,
          examId: zerothOptions.examId,
          text: zerothOptions.text,
        })
        .from(zerothOptions)
        .where(inArray(zerothOptions.examId, ids))
        .orderBy(asc(zerothOptions.examId), asc(zerothOptions.position)),
      this.db
        .select({ optionId: zerothAnswers.optionId, count: count() })
        .from(zerothAnswers)
        .where(inArray(zerothAnswers.examId, ids))
        .groupBy(zerothAnswers.optionId),
    ]);
    const chosen = new Map(counts.map((c) => [c.optionId, Number(c.count)]));
    const optionsOf = new Map<string, Array<{ text: string; count: number }>>();
    for (const option of options) {
      const list = optionsOf.get(option.examId) ?? [];
      list.push({ text: option.text, count: chosen.get(option.id) ?? 0 });
      optionsOf.set(option.examId, list);
    }
    return asked
      .map((exam) => ({
        examId: exam.examId,
        question: exam.question,
        courseTitle: exam.courseTitle,
        koskName: exam.koskName,
        startsAt: exam.startsAt as Date,
        options: optionsOf.get(exam.examId) ?? [],
      }))
      .reverse();
  }

  /** The courses of the place that held a published online exam, whenever: the filters' choices. */
  async courses(
    koskIds: readonly string[] | null
  ): Promise<IZerothCourseRow[]> {
    if (koskIds?.length === 0) return [];
    return this.db
      .selectDistinct({
        courseId: courses.id,
        courseTitle: courses.title,
        koskId: courses.koskId,
        koskName: kosks.name,
        madrasahId: courses.madrasahId,
        madrasahName: madrasahs.name,
      })
      .from(onlineExams)
      .innerJoin(courses, eq(courses.id, onlineExams.courseId))
      .innerJoin(kosks, eq(kosks.id, courses.koskId))
      .leftJoin(madrasahs, eq(madrasahs.id, courses.madrasahId))
      .where(
        and(isNotNull(onlineExams.publishedAt), ...this.placeOf({ koskIds }))
      )
      .orderBy(asc(kosks.name), asc(courses.title), asc(courses.id));
  }

  /**
   * The köşks where the person holds something of their own: a köşk nazımı
   * post, or a grant in the köşk. Whether that holds `exam.zeroth_read` is the
   * engine's to say; this only names where to ask.
   */
  async koskCandidates(userId: string): Promise<string[]> {
    const [roles, grants] = await Promise.all([
      this.db
        .selectDistinct({ id: roleAssignments.scopeId })
        .from(roleAssignments)
        .where(
          and(
            eq(roleAssignments.userId, userId),
            eq(roleAssignments.role, ASSIGNED_ROLES.KOSK_NAZIM),
            isHeld()
          )
        ),
      this.db
        .selectDistinct({ id: permissionGrants.scopeId })
        .from(permissionGrants)
        .where(
          and(
            eq(permissionGrants.userId, userId),
            eq(permissionGrants.scopeType, SCOPE_TYPES.KOSK),
            grantHeld()
          )
        ),
    ]);
    return [
      ...new Set(
        [...roles, ...grants].flatMap((row) => (row.id ? [row.id] : []))
      ),
    ];
  }

  /** The read itself goes on the record, as the platform's other reads do. */
  async recordRead(entry: {
    actorId: string;
    entityId: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId: entry.actorId,
      action: "exam.zeroth_read",
      entity: "exam_zeroth_answers",
      entityId: entry.entityId,
      details: entry.details,
    });
  }
}
