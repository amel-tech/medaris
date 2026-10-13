import { Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { displayNameOf } from "../assignment/assignment.service";
import type { Tx } from "../course/course-purge";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseWeeks,
  enrollments,
  lessons,
} from "../database/schema/course.schema";
import { lessonAssignments } from "../database/schema/lesson-assignment.schema";
import {
  lessonSubmissions,
  submissionFiles,
} from "../database/schema/lesson-submission.schema";
import { users } from "../database/schema/user.schema";
import {
  claimUpload,
  enqueueStorageDeletions,
} from "../storage/storage-deletions";
import type { IStoredFile } from "../storage/stored-file";
import { SubmissionFileLimitError } from "./errors/submission-file-limit.error";

/** A file of a homework, as tedrisat keeps it; `storageKey` never leaves it. */
export type ISubmissionFile = typeof submissionFiles.$inferSelect;

/** A talebe's homework on a celse, with its files oldest first. */
export interface ISubmission {
  id: string;
  lessonId: string;
  userId: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  files: ISubmissionFile[];
}

/** A homework as the course's staff list it: whose it is and on which celse. */
export interface IStaffSubmission extends ISubmission {
  lessonTitle: string;
  weekNumber: number;
  talebe: { id: string; name: string | null };
}

/** A homework file with whose it is and where. */
export interface ILocatedSubmissionFile extends ISubmissionFile {
  userId: string;
  lessonId: string;
}

type Db = DatabaseService["db"] | Tx;

/** Where a celse of the course stands on homework, for its staff. */
export interface ISessionHandIns {
  lessonId: string;
  hasAssignment: boolean;
  /** Enrolled talebe who handed in on it. */
  handedInCount: number;
}

/**
 * A submission counts as handed in once it holds a note or a file: a talebe
 * who emptied theirs has handed nothing in. Read where `lesson_submissions`
 * is in the query.
 */
const handedIn = sql<boolean>`(${lessonSubmissions.note} is not null or exists (select 1 from ${submissionFiles} where ${submissionFiles.submissionId} = ${lessonSubmissions.id}))`;

/** Who may hand in, and so who "N / M teslim" counts: ENROLLED or COMPLETED. */
const SEATED = [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED];

/**
 * Homework on a celse (MDRS-290). Whose a homework is, is decided here: every
 * read and write of the talebe's own names the talebe, and the staff reads
 * name the course. Every write that drops a file marks its object for removal
 * from storage in its own transaction and goes to `audit_log`.
 */
@Injectable()
export class LessonSubmissionRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** Whether the celse is live, which every write needs. */
  async isLiveLesson(lessonId: string, db: Db = this.db): Promise<boolean> {
    const [row] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
      .limit(1);
    return Boolean(row);
  }

  /** The talebe's own homework on the celse, or null. */
  async findOwn(
    lessonId: string,
    userId: string,
    db: Db = this.db
  ): Promise<ISubmission | null> {
    const [row] = await db
      .select()
      .from(lessonSubmissions)
      .where(
        and(
          eq(lessonSubmissions.lessonId, lessonId),
          eq(lessonSubmissions.userId, userId)
        )
      )
      .limit(1);
    if (!row) return null;
    const files = await db
      .select()
      .from(submissionFiles)
      .where(eq(submissionFiles.submissionId, row.id))
      .orderBy(asc(submissionFiles.createdAt), asc(submissionFiles.id));
    return { ...row, files };
  }

  /** How many files the talebe's homework on the celse holds. */
  async countFiles(lessonId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(submissionFiles)
      .innerJoin(
        lessonSubmissions,
        eq(lessonSubmissions.id, submissionFiles.submissionId)
      )
      .where(
        and(
          eq(lessonSubmissions.lessonId, lessonId),
          eq(lessonSubmissions.userId, userId)
        )
      );
    return row?.n ?? 0;
  }

  /** Writes the note, making the homework if there is none yet. */
  async saveNote(
    lessonId: string,
    userId: string,
    note: string | null
  ): Promise<ISubmission> {
    return this.db.transaction(async (tx) => {
      if (!(await this.isLiveLesson(lessonId, tx))) {
        throw new LessonNotFoundError(lessonId);
      }
      await tx
        .insert(lessonSubmissions)
        .values({ lessonId, userId, note })
        .onConflictDoUpdate({
          target: [lessonSubmissions.lessonId, lessonSubmissions.userId],
          set: { note, updatedAt: new Date() },
        });
      return (await this.findOwn(lessonId, userId, tx)) as ISubmission;
    });
  }

  /**
   * Adds a stored file to the talebe's homework, making it if there is none,
   * under the homework row's lock so two uploads at once cannot pass the
   * limit together: the row, the upload's claim on its object
   * (`claimUpload`) and `submission.file_upload` in `audit_log`, in one
   * transaction.
   */
  async addFile(
    lessonId: string,
    userId: string,
    courseId: string,
    file: IStoredFile,
    maxFiles: number
  ): Promise<ISubmission> {
    return this.db.transaction(async (tx) => {
      if (!(await this.isLiveLesson(lessonId, tx))) {
        throw new LessonNotFoundError(lessonId);
      }
      await tx
        .insert(lessonSubmissions)
        .values({ lessonId, userId })
        .onConflictDoNothing({
          target: [lessonSubmissions.lessonId, lessonSubmissions.userId],
        });
      const [submission] = await tx
        .select({ id: lessonSubmissions.id })
        .from(lessonSubmissions)
        .where(
          and(
            eq(lessonSubmissions.lessonId, lessonId),
            eq(lessonSubmissions.userId, userId)
          )
        )
        .for("update");
      const [held] = await tx
        .select({ n: count() })
        .from(submissionFiles)
        .where(eq(submissionFiles.submissionId, submission.id));
      if ((held?.n ?? 0) >= maxFiles) {
        throw new SubmissionFileLimitError(maxFiles);
      }
      const [row] = await tx
        .insert(submissionFiles)
        .values({ submissionId: submission.id, ...file })
        .returning();
      await claimUpload(tx, file.storageKey);
      await tx
        .update(lessonSubmissions)
        .set({ updatedAt: new Date() })
        .where(eq(lessonSubmissions.id, submission.id));
      await tx.insert(auditLog).values({
        actorId: userId,
        action: "submission.file_upload",
        entity: "submission",
        entityId: submission.id,
        details: {
          courseId,
          lessonId,
          fileId: row.id,
          fileName: row.fileName,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
        },
      });
      return (await this.findOwn(lessonId, userId, tx)) as ISubmission;
    });
  }

  /** A file of a homework on the celse, whoever's it is, or null. */
  async findLessonFile(
    lessonId: string,
    fileId: string
  ): Promise<ILocatedSubmissionFile | null> {
    const [row] = await this.locatedFiles()
      .where(
        and(
          eq(submissionFiles.id, fileId),
          eq(lessonSubmissions.lessonId, lessonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** A file of a homework on any celse of the course, or null. */
  async findCourseFile(
    courseId: string,
    fileId: string
  ): Promise<ILocatedSubmissionFile | null> {
    const [row] = await this.locatedFiles()
      .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(eq(submissionFiles.id, fileId), eq(courseWeeks.courseId, courseId))
      )
      .limit(1);
    return row ?? null;
  }

  private locatedFiles() {
    return this.db
      .select({
        id: submissionFiles.id,
        submissionId: submissionFiles.submissionId,
        storageKey: submissionFiles.storageKey,
        fileName: submissionFiles.fileName,
        contentType: submissionFiles.contentType,
        sizeBytes: submissionFiles.sizeBytes,
        createdAt: submissionFiles.createdAt,
        userId: lessonSubmissions.userId,
        lessonId: lessonSubmissions.lessonId,
      })
      .from(submissionFiles)
      .innerJoin(
        lessonSubmissions,
        eq(lessonSubmissions.id, submissionFiles.submissionId)
      );
  }

  /**
   * Removes a file of the talebe's own homework: the row, its object marked
   * for removal from storage, `submission.file_delete` in `audit_log`. False
   * when the talebe has no such file there.
   */
  async removeOwnFile(
    lessonId: string,
    userId: string,
    courseId: string,
    fileId: string
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [submission] = await tx
        .select({ id: lessonSubmissions.id })
        .from(lessonSubmissions)
        .where(
          and(
            eq(lessonSubmissions.lessonId, lessonId),
            eq(lessonSubmissions.userId, userId)
          )
        )
        .for("update");
      if (!submission) return false;
      const [removed] = await tx
        .delete(submissionFiles)
        .where(
          and(
            eq(submissionFiles.id, fileId),
            eq(submissionFiles.submissionId, submission.id)
          )
        )
        .returning();
      if (!removed) return false;
      await enqueueStorageDeletions(
        tx,
        [removed.storageKey],
        "submission.file_delete"
      );
      await tx
        .update(lessonSubmissions)
        .set({ updatedAt: new Date() })
        .where(eq(lessonSubmissions.id, submission.id));
      await tx.insert(auditLog).values({
        actorId: userId,
        action: "submission.file_delete",
        entity: "submission",
        entityId: submission.id,
        details: {
          courseId,
          lessonId,
          fileId: removed.id,
          fileName: removed.fileName,
          sizeBytes: removed.sizeBytes,
        },
      });
      return true;
    });
  }

  /**
   * The homework on the course's live celses, by programme order and then
   * the latest change first, with whose each is. `lessonId` narrows it to one
   * celse.
   */
  async listForCourse(
    courseId: string,
    lessonId?: string
  ): Promise<IStaffSubmission[]> {
    const rows = await this.db
      .select({
        submission: lessonSubmissions,
        lessonTitle: lessons.title,
        weekNumber: courseWeeks.weekNumber,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(lessonSubmissions)
      .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .leftJoin(users, eq(users.id, lessonSubmissions.userId))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt),
          lessonId ? eq(lessonSubmissions.lessonId, lessonId) : undefined
        )
      )
      .orderBy(
        asc(courseWeeks.weekNumber),
        asc(lessons.orderIndex),
        desc(lessonSubmissions.updatedAt),
        asc(lessonSubmissions.id)
      );
    if (rows.length === 0) return [];
    const files = await this.db
      .select()
      .from(submissionFiles)
      .where(
        inArray(
          submissionFiles.submissionId,
          rows.map((r) => r.submission.id)
        )
      )
      .orderBy(asc(submissionFiles.createdAt), asc(submissionFiles.id));
    return rows.map((r) => ({
      ...r.submission,
      files: files.filter((f) => f.submissionId === r.submission.id),
      lessonTitle: r.lessonTitle,
      weekNumber: r.weekNumber,
      talebe: {
        id: r.submission.userId,
        // As the course's questions name who asked (MDRS-150); null for an
        // account tedrisat has not seen sign in.
        name: displayNameOf({
          givenName: r.givenName ?? null,
          familyName: r.familyName ?? null,
          email: r.email ?? null,
        }),
      },
    }));
  }

  /**
   * The course's live celses the talebe handed homework in on, in programme
   * order, with when they last changed it: what the course page marks.
   */
  async listOwnHandedIn(
    courseId: string,
    userId: string
  ): Promise<{ lessonId: string; updatedAt: Date }[]> {
    return this.db
      .select({
        lessonId: lessonSubmissions.lessonId,
        updatedAt: lessonSubmissions.updatedAt,
      })
      .from(lessonSubmissions)
      .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          eq(lessonSubmissions.userId, userId),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt),
          handedIn
        )
      )
      .orderBy(asc(courseWeeks.weekNumber), asc(lessons.orderIndex));
  }

  /**
   * Every live celse of the course in programme order (`lessonId` narrows it
   * to one), with whether the course team set homework on it and how many of
   * the course's enrolled talebe handed in there, and how many enrolled
   * talebe the course has: Ödevler's "N / M teslim". A submission of
   * somebody no longer enrolled is listed by `listForCourse` but not counted
   * here, so N never passes M.
   */
  async handInsForCourse(
    courseId: string,
    lessonId?: string
  ): Promise<{ sessions: ISessionHandIns[]; talebeCount: number }> {
    const live = and(
      eq(courseWeeks.courseId, courseId),
      isNull(lessons.archivedAt),
      isNull(courseWeeks.archivedAt),
      lessonId ? eq(lessons.id, lessonId) : undefined
    );
    const [celses, counts, [seated]] = await Promise.all([
      this.db
        .select({ lessonId: lessons.id, assignmentId: lessonAssignments.id })
        .from(lessons)
        .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
        .leftJoin(lessonAssignments, eq(lessonAssignments.lessonId, lessons.id))
        .where(live)
        .orderBy(
          asc(courseWeeks.weekNumber),
          asc(lessons.orderIndex),
          asc(lessons.id)
        ),
      this.db
        .select({ lessonId: lessonSubmissions.lessonId, n: count() })
        .from(lessonSubmissions)
        .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
        .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
        .innerJoin(
          enrollments,
          and(
            eq(enrollments.userId, lessonSubmissions.userId),
            eq(enrollments.courseId, courseWeeks.courseId),
            inArray(enrollments.status, SEATED)
          )
        )
        .where(and(live, handedIn))
        .groupBy(lessonSubmissions.lessonId),
      this.db
        .select({ n: count() })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseId, courseId),
            inArray(enrollments.status, SEATED)
          )
        ),
    ]);
    const handedInBy = new Map(counts.map((c) => [c.lessonId, c.n]));
    return {
      sessions: celses.map((celse) => ({
        lessonId: celse.lessonId,
        hasAssignment: celse.assignmentId !== null,
        handedInCount: handedInBy.get(celse.lessonId) ?? 0,
      })),
      talebeCount: seated?.n ?? 0,
    };
  }

  /** A staff download of a homework file, written before the file is sent. */
  async recordStaffDownload(
    actorId: string,
    file: ILocatedSubmissionFile,
    courseId: string
  ): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId,
      action: "submission.file_download",
      entity: "submission",
      entityId: file.submissionId,
      details: {
        courseId,
        lessonId: file.lessonId,
        talebeId: file.userId,
        fileId: file.id,
        fileName: file.fileName,
      },
    });
  }
}
