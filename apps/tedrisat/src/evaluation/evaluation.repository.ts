import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { displayNameOf } from "../assignment/assignment.service";
import {
  AssignmentKind,
  type EvaluationStatus,
} from "../course/domain/assignment-kind.enum";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import {
  assignmentEvaluations,
  lessonAssignments,
} from "../database/schema/lesson-assignment.schema";
import { users } from "../database/schema/user.schema";
import { EvaluationTalebeNotFoundError } from "./errors/evaluation-talebe-not-found.error";
import { MemorizationNotFoundError } from "./errors/memorization-not-found.error";

/** Who may be marked, as who may hand homework in: ENROLLED or COMPLETED. */
const SEATED = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

/** A memorisation homework on a live session of the course. */
export interface IMemorizationColumn {
  assignmentId: string;
  lessonId: string;
  title: string;
  weekNumber: number;
  orderIndex: number;
  scheduledAt: Date | null;
  description: string | null;
}

/** A mark as tedrisat keeps it. */
export interface IEvaluationMark {
  lessonId: string;
  userId: string;
  status: EvaluationStatus;
  note: string | null;
  updatedAt: Date;
}

/** A talebe seated in the course. */
export interface IEvaluationTalebe {
  id: string;
  name: string | null;
}

/** Who gave a mark and on which course, for its `audit_log` row. */
export interface IEvaluationWrite {
  courseId: string;
  actorId: string;
}

/**
 * The course team's marks on memorisation homework (MDRS-248). Whose a mark
 * is, is decided here: the talebe's read names the talebe, the course team's
 * names the course, and a write names a session of a course and a talebe
 * seated in it. Every change goes to `audit_log` in its own transaction.
 */
@Injectable()
export class EvaluationRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The course's memorisation homework on its live sessions, in programme order. */
  async listColumns(courseId: string): Promise<IMemorizationColumn[]> {
    return this.db
      .select({
        assignmentId: lessonAssignments.id,
        lessonId: lessons.id,
        title: lessons.title,
        weekNumber: courseWeeks.weekNumber,
        orderIndex: lessons.orderIndex,
        scheduledAt: lessons.scheduledAt,
        description: lessonAssignments.description,
      })
      .from(lessonAssignments)
      .innerJoin(lessons, eq(lessons.id, lessonAssignments.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          eq(lessonAssignments.kind, AssignmentKind.MEMORIZE),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt)
        )
      )
      .orderBy(
        asc(courseWeeks.weekNumber),
        asc(lessons.orderIndex),
        asc(lessons.id)
      );
  }

  /** The talebe seated in the course, by name; one with no name sorts last. */
  async listTalebe(courseId: string): Promise<IEvaluationTalebe[]> {
    const rows = await this.db
      .select({
        id: enrollments.userId,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
        studentName: enrollments.studentName,
        studentEmail: enrollments.studentEmail,
      })
      .from(enrollments)
      .leftJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.courseId, courseId),
          inArray(enrollments.status, SEATED)
        )
      );
    const people = rows.map((row) => ({
      id: row.id,
      // As the course's homework names who handed in, else as they enrolled.
      name:
        displayNameOf({
          givenName: row.givenName ?? null,
          familyName: row.familyName ?? null,
          email: row.email ?? null,
        }) ??
        row.studentName ??
        row.studentEmail ??
        null,
    }));
    return people.sort((a, b) =>
      a.name === null
        ? b.name === null
          ? a.id.localeCompare(b.id)
          : 1
        : b.name === null
          ? -1
          : a.name.localeCompare(b.name, "tr") || a.id.localeCompare(b.id)
    );
  }

  /** The marks on the given homework; none for an empty list. */
  async listMarks(columns: IMemorizationColumn[]): Promise<IEvaluationMark[]> {
    if (columns.length === 0) return [];
    const lessonOf = new Map(columns.map((c) => [c.assignmentId, c.lessonId]));
    const rows = await this.db
      .select()
      .from(assignmentEvaluations)
      .where(inArray(assignmentEvaluations.assignmentId, [...lessonOf.keys()]));
    return rows.map((row) => ({
      lessonId: lessonOf.get(row.assignmentId) as string,
      userId: row.userId,
      status: row.status,
      note: row.note,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * The talebe's own mark on the session's memorisation homework: null while
   * there is none. MEMORIZATION_NOT_FOUND when the session has no such
   * homework.
   */
  async findOwn(
    lessonId: string,
    userId: string
  ): Promise<IEvaluationMark | null> {
    const [assignment] = await this.db
      .select({ id: lessonAssignments.id })
      .from(lessonAssignments)
      .where(
        and(
          eq(lessonAssignments.lessonId, lessonId),
          eq(lessonAssignments.kind, AssignmentKind.MEMORIZE)
        )
      )
      .limit(1);
    if (!assignment) throw new MemorizationNotFoundError(lessonId);
    const [row] = await this.db
      .select()
      .from(assignmentEvaluations)
      .where(
        and(
          eq(assignmentEvaluations.assignmentId, assignment.id),
          eq(assignmentEvaluations.userId, userId)
        )
      )
      .limit(1);
    return row
      ? {
          lessonId,
          userId,
          status: row.status,
          note: row.note,
          updatedAt: row.updatedAt,
        }
      : null;
  }

  /**
   * Marks a talebe on the session's memorisation homework, or changes the
   * mark: `assignment_evaluation.save` with the status and the note's length,
   * never its text. A save that changes nothing writes nothing. The session
   * must be live and its homework a memorisation (MEMORIZATION_NOT_FOUND),
   * the talebe seated in its course (EVALUATION_TALEBE_NOT_FOUND). The
   * homework row is held for the transaction, so taking it off waits.
   */
  async save(
    lessonId: string,
    userId: string,
    status: EvaluationStatus,
    note: string | null,
    write: IEvaluationWrite
  ): Promise<IEvaluationMark> {
    return this.db.transaction(async (tx) => {
      const [live] = await tx
        .select({ courseId: courseWeeks.courseId })
        .from(lessons)
        .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
        .where(
          and(
            eq(lessons.id, lessonId),
            isNull(lessons.archivedAt),
            isNull(courseWeeks.archivedAt)
          )
        )
        .limit(1);
      if (!live || live.courseId !== write.courseId) {
        throw new LessonNotFoundError(lessonId);
      }
      const [assignment] = await tx
        .select({ id: lessonAssignments.id, kind: lessonAssignments.kind })
        .from(lessonAssignments)
        .where(eq(lessonAssignments.lessonId, lessonId))
        .for("share");
      if (assignment?.kind !== AssignmentKind.MEMORIZE) {
        throw new MemorizationNotFoundError(lessonId);
      }
      const [seat] = await tx
        .select({ userId: enrollments.userId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, write.courseId),
            eq(enrollments.userId, userId),
            inArray(enrollments.status, SEATED)
          )
        )
        .limit(1);
      if (!seat) throw new EvaluationTalebeNotFoundError(userId);

      const [held] = await tx
        .select()
        .from(assignmentEvaluations)
        .where(
          and(
            eq(assignmentEvaluations.assignmentId, assignment.id),
            eq(assignmentEvaluations.userId, userId)
          )
        )
        .for("update");
      if (held && held.status === status && held.note === note) {
        return {
          lessonId,
          userId,
          status: held.status,
          note: held.note,
          updatedAt: held.updatedAt,
        };
      }
      const now = new Date();
      const [saved] = await tx
        .insert(assignmentEvaluations)
        .values({
          assignmentId: assignment.id,
          userId,
          status,
          note,
          evaluatedBy: write.actorId,
        })
        .onConflictDoUpdate({
          target: [
            assignmentEvaluations.assignmentId,
            assignmentEvaluations.userId,
          ],
          set: { status, note, evaluatedBy: write.actorId, updatedAt: now },
        })
        .returning();
      await tx.insert(auditLog).values({
        actorId: write.actorId,
        action: "assignment_evaluation.save",
        entity: "assignment_evaluation",
        entityId: saved.id,
        details: {
          courseId: write.courseId,
          lessonId,
          talebeId: userId,
          status: held ? { from: held.status, to: status } : status,
          noteLength: note?.length ?? 0,
        },
      });
      return {
        lessonId,
        userId,
        status: saved.status,
        note: saved.note,
        updatedAt: saved.updatedAt,
      };
    });
  }
}
