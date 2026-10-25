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
  submissionReviewFiles,
} from "../database/schema/lesson-submission.schema";
import { users } from "../database/schema/user.schema";
import {
  claimUpload,
  enqueueStorageDeletions,
} from "../storage/storage-deletions";
import type { IStoredFile } from "../storage/stored-file";
import { SubmissionFileLimitError } from "./errors/submission-file-limit.error";
import { SubmissionReviewEmptyError } from "./errors/submission-review-empty.error";
import { SubmissionReviewFileLimitError } from "./errors/submission-review-file-limit.error";

/** A file of a homework, as tedrisat keeps it; `storageKey` never leaves it. */
export type ISubmissionFile = typeof submissionFiles.$inferSelect;

/** A file the course team returned with its review; `storageKey` never leaves tedrisat. */
export type ISubmissionReviewFile = typeof submissionReviewFiles.$inferSelect;

/** A person named on a homework. */
export interface ISubmissionPerson {
  id: string;
  name: string | null;
}

/** A talebe's homework on a celse, with its files oldest first. */
export interface ISubmission {
  id: string;
  lessonId: string;
  userId: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  files: ISubmissionFile[];
  /** The course team's review: null until sent. */
  reviewNote: string | null;
  reviewedAt: Date | null;
  reviewer: ISubmissionPerson | null;
  /** Oldest first, including those added before the review was sent. */
  reviewFiles: ISubmissionReviewFile[];
}

/** A homework of the course with its celse, for a review route. */
export interface ICourseSubmissionRef {
  id: string;
  lessonId: string;
  userId: string;
  lessonTitle: string;
}

/** A review file with whose homework it answers, where, and whether the review is sent. */
export interface ILocatedReviewFile extends ISubmissionReviewFile {
  userId: string;
  lessonId: string;
  reviewedAt: Date | null;
}

type SubmissionRow = typeof lessonSubmissions.$inferSelect;

const personOf = (
  id: string,
  user: {
    givenName: string | null;
    familyName: string | null;
    email: string | null;
  } | null
): ISubmissionPerson => ({
  id,
  // As the course's questions name who asked (MDRS-150); null for an
  // account tedrisat has not seen sign in.
  name: user
    ? displayNameOf({
        givenName: user.givenName ?? null,
        familyName: user.familyName ?? null,
        email: user.email ?? null,
      })
    : null,
});

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
    const [submission] = await this.withFiles([row], db);
    return submission;
  }

  /** The names of the given accounts; none read for an empty list. */
  private async findPeople(
    ids: string[],
    db: Db
  ): Promise<
    {
      id: string;
      givenName: string | null;
      familyName: string | null;
      email: string | null;
    }[]
  > {
    if (ids.length === 0) return [];
    return db
      .select({
        id: users.id,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(users)
      .where(inArray(users.id, ids));
  }

  /**
   * The rows with their files, their review files, oldest first, and who
   * sent their review. Three reads whatever the number of rows.
   */
  private async withFiles(
    rows: SubmissionRow[],
    db: Db = this.db
  ): Promise<ISubmission[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const reviewerIds = [
      ...new Set(
        rows.map((r) => r.reviewedBy).filter((id): id is string => Boolean(id))
      ),
    ];
    const [files, reviewFiles, reviewers] = await Promise.all([
      db
        .select()
        .from(submissionFiles)
        .where(inArray(submissionFiles.submissionId, ids))
        .orderBy(asc(submissionFiles.createdAt), asc(submissionFiles.id)),
      db
        .select()
        .from(submissionReviewFiles)
        .where(inArray(submissionReviewFiles.submissionId, ids))
        .orderBy(
          asc(submissionReviewFiles.createdAt),
          asc(submissionReviewFiles.id)
        ),
      this.findPeople(reviewerIds, db),
    ]);
    const reviewerById = new Map(reviewers.map((u) => [u.id, u]));
    return rows.map((row) => ({
      id: row.id,
      lessonId: row.lessonId,
      userId: row.userId,
      note: row.note,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      files: files.filter((f) => f.submissionId === row.id),
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt,
      reviewer: row.reviewedBy
        ? personOf(row.reviewedBy, reviewerById.get(row.reviewedBy) ?? null)
        : null,
      reviewFiles: reviewFiles.filter((f) => f.submissionId === row.id),
    }));
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
    const submissions = await this.withFiles(rows.map((r) => r.submission));
    return rows.map((r, i) => ({
      ...submissions[i],
      lessonTitle: r.lessonTitle,
      weekNumber: r.weekNumber,
      talebe: personOf(r.submission.userId, {
        givenName: r.givenName,
        familyName: r.familyName,
        email: r.email,
      }),
    }));
  }

  /** One homework of the course as the staff list shows it, or null. */
  async findStaffSubmission(
    courseId: string,
    submissionId: string
  ): Promise<IStaffSubmission | null> {
    const ref = await this.findCourseSubmission(courseId, submissionId);
    if (!ref) return null;
    const [item] = (await this.listForCourse(courseId, ref.lessonId)).filter(
      (s) => s.id === submissionId
    );
    return item ?? null;
  }

  /** A homework on a live celse of the course, or null. */
  async findCourseSubmission(
    courseId: string,
    submissionId: string
  ): Promise<ICourseSubmissionRef | null> {
    const [row] = await this.db
      .select({
        id: lessonSubmissions.id,
        lessonId: lessonSubmissions.lessonId,
        userId: lessonSubmissions.userId,
        lessonTitle: lessons.title,
      })
      .from(lessonSubmissions)
      .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(lessonSubmissions.id, submissionId),
          eq(courseWeeks.courseId, courseId),
          isNull(lessons.archivedAt),
          isNull(courseWeeks.archivedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** How many review files a homework carries. */
  async countReviewFiles(submissionId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(submissionReviewFiles)
      .where(eq(submissionReviewFiles.submissionId, submissionId));
    return row?.n ?? 0;
  }

  /**
   * Adds a stored file to the course team's review of a homework, under the
   * homework row's lock so two uploads at once cannot pass the limit
   * together, with the upload's claim on its object and
   * `submission.review_file_upload` in `audit_log`. It is not sent by this:
   * a review already sent shows the file to the talebe at once, one not yet
   * sent shows it when it is.
   */
  async addReviewFile(
    submissionId: string,
    actorId: string,
    courseId: string,
    file: IStoredFile,
    maxFiles: number
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          id: lessonSubmissions.id,
          lessonId: lessonSubmissions.lessonId,
        })
        .from(lessonSubmissions)
        .where(eq(lessonSubmissions.id, submissionId))
        .for("update");
      if (!locked || !(await this.isLiveLesson(locked.lessonId, tx))) {
        throw new LessonNotFoundError(locked?.lessonId ?? submissionId);
      }
      const [held] = await tx
        .select({ n: count() })
        .from(submissionReviewFiles)
        .where(eq(submissionReviewFiles.submissionId, submissionId));
      if ((held?.n ?? 0) >= maxFiles) {
        throw new SubmissionReviewFileLimitError(maxFiles);
      }
      const [row] = await tx
        .insert(submissionReviewFiles)
        .values({ submissionId, uploadedBy: actorId, ...file })
        .returning();
      await claimUpload(tx, file.storageKey);
      await tx.insert(auditLog).values({
        actorId,
        action: "submission.review_file_upload",
        entity: "submission",
        entityId: submissionId,
        details: {
          courseId,
          lessonId: locked.lessonId,
          fileId: row.id,
          fileName: row.fileName,
          contentType: row.contentType,
          sizeBytes: row.sizeBytes,
        },
      });
    });
  }

  /**
   * Removes a review file of a homework: the row, its object marked for
   * removal from storage, `submission.review_file_delete` in `audit_log`.
   * False when the homework has no such review file.
   */
  async removeReviewFile(
    submissionId: string,
    actorId: string,
    courseId: string,
    fileId: string
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(submissionReviewFiles)
        .where(
          and(
            eq(submissionReviewFiles.id, fileId),
            eq(submissionReviewFiles.submissionId, submissionId)
          )
        )
        .returning();
      if (!removed) return false;
      await enqueueStorageDeletions(
        tx,
        [removed.storageKey],
        "submission.review_file_delete"
      );
      await tx.insert(auditLog).values({
        actorId,
        action: "submission.review_file_delete",
        entity: "submission",
        entityId: submissionId,
        details: {
          courseId,
          fileId: removed.id,
          fileName: removed.fileName,
          sizeBytes: removed.sizeBytes,
        },
      });
      return true;
    });
  }

  /**
   * Sends the review to the talebe: the note (replacing an earlier one), who
   * sent it and when, under the homework row's lock, with `submission.review`
   * in `audit_log` (the note's length, not its text). A review with neither a
   * note nor a file is refused. Returns whether this is the first sending.
   */
  async sendReview(
    submissionId: string,
    actorId: string,
    courseId: string,
    note: string | null
  ): Promise<{ first: boolean }> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          lessonId: lessonSubmissions.lessonId,
          reviewedAt: lessonSubmissions.reviewedAt,
        })
        .from(lessonSubmissions)
        .where(eq(lessonSubmissions.id, submissionId))
        .for("update");
      if (!locked || !(await this.isLiveLesson(locked.lessonId, tx))) {
        throw new LessonNotFoundError(locked?.lessonId ?? submissionId);
      }
      if (note === null) {
        const [held] = await tx
          .select({ n: count() })
          .from(submissionReviewFiles)
          .where(eq(submissionReviewFiles.submissionId, submissionId));
        if ((held?.n ?? 0) === 0) throw new SubmissionReviewEmptyError();
      }
      await tx
        .update(lessonSubmissions)
        .set({ reviewNote: note, reviewedBy: actorId, reviewedAt: new Date() })
        .where(eq(lessonSubmissions.id, submissionId));
      await tx.insert(auditLog).values({
        actorId,
        action: "submission.review",
        entity: "submission",
        entityId: submissionId,
        details: {
          courseId,
          lessonId: locked.lessonId,
          noteLength: note?.length ?? 0,
          first: locked.reviewedAt === null,
        },
      });
      return { first: locked.reviewedAt === null };
    });
  }

  /** A review file of a homework on any celse of the course, or null. */
  async findCourseReviewFile(
    courseId: string,
    fileId: string
  ): Promise<ILocatedReviewFile | null> {
    const [row] = await this.locatedReviewFiles()
      .innerJoin(lessons, eq(lessons.id, lessonSubmissions.lessonId))
      .innerJoin(courseWeeks, eq(courseWeeks.id, lessons.weekId))
      .where(
        and(
          eq(submissionReviewFiles.id, fileId),
          eq(courseWeeks.courseId, courseId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** A review file of a homework on the celse, whoever's it is, or null. */
  async findLessonReviewFile(
    lessonId: string,
    fileId: string
  ): Promise<ILocatedReviewFile | null> {
    const [row] = await this.locatedReviewFiles()
      .where(
        and(
          eq(submissionReviewFiles.id, fileId),
          eq(lessonSubmissions.lessonId, lessonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  private locatedReviewFiles() {
    return this.db
      .select({
        id: submissionReviewFiles.id,
        submissionId: submissionReviewFiles.submissionId,
        storageKey: submissionReviewFiles.storageKey,
        fileName: submissionReviewFiles.fileName,
        contentType: submissionReviewFiles.contentType,
        sizeBytes: submissionReviewFiles.sizeBytes,
        uploadedBy: submissionReviewFiles.uploadedBy,
        createdAt: submissionReviewFiles.createdAt,
        userId: lessonSubmissions.userId,
        lessonId: lessonSubmissions.lessonId,
        reviewedAt: lessonSubmissions.reviewedAt,
      })
      .from(submissionReviewFiles)
      .innerJoin(
        lessonSubmissions,
        eq(lessonSubmissions.id, submissionReviewFiles.submissionId)
      );
  }

  /** A staff download of a review file, written before the file is sent. */
  async recordReviewFileDownload(
    actorId: string,
    file: ILocatedReviewFile,
    courseId: string
  ): Promise<void> {
    await this.db.insert(auditLog).values({
      actorId,
      action: "submission.review_file_download",
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
