import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { lessons } from "../database/schema/course.schema";
import {
  lessonAssignmentFiles,
  lessonAssignments,
} from "../database/schema/lesson-assignment.schema";
import {
  claimUpload,
  enqueueStorageDeletions,
} from "../storage/storage-deletions";
import type { IStoredFile } from "../storage/stored-file";
import type { Tx } from "./course-purge";
import {
  type ILessonAssignment,
  lessonAssignmentOf,
} from "./domain/lesson-assignment";
import { LessonAssignmentNotFoundError } from "./errors/lesson-assignment-not-found.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";

type Db = DatabaseService["db"] | Tx;

/** Who made a write and on which course, for its `audit_log` row. */
export interface IAssignmentWrite {
  courseId: string;
  actorId: string;
}

/**
 * The homework of the given celses, each with its files oldest first, by
 * celse. A celse with no homework is not in the map. The course read
 * (`CourseRepository.findDetailById`) puts it on each of its lessons.
 */
export async function findLessonAssignments(
  db: Db,
  lessonIds: readonly string[]
): Promise<Map<string, ILessonAssignment>> {
  const found = new Map<string, ILessonAssignment>();
  if (lessonIds.length === 0) return found;
  const rows = await db
    .select()
    .from(lessonAssignments)
    .where(inArray(lessonAssignments.lessonId, [...lessonIds]));
  if (rows.length === 0) return found;
  const files = await db
    .select()
    .from(lessonAssignmentFiles)
    .where(
      inArray(
        lessonAssignmentFiles.assignmentId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(
      asc(lessonAssignmentFiles.createdAt),
      asc(lessonAssignmentFiles.id)
    );
  for (const row of rows) {
    found.set(
      row.lessonId,
      lessonAssignmentOf(
        row,
        files.filter((file) => file.assignmentId === row.id)
      )
    );
  }
  return found;
}

/**
 * The homework a müderris sets on a celse. Every write runs in one
 * transaction with its `audit_log` row (`lesson_assignment.create`,
 * `.update`, `.delete`, `.file_upload`, `.file_delete`), under the homework
 * row's lock, and on a live celse only. A write that drops a file marks its
 * object for removal from storage in the same transaction.
 */
@Injectable()
export class LessonAssignmentRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The celse's homework, or null. */
  async find(
    lessonId: string,
    db: Db = this.db
  ): Promise<ILessonAssignment | null> {
    return (await findLessonAssignments(db, [lessonId])).get(lessonId) ?? null;
  }

  /** The stored file of the celse's homework, or null. */
  async findFile(
    lessonId: string,
    fileId: string
  ): Promise<IStoredFile | null> {
    const [row] = await this.db
      .select({
        storageKey: lessonAssignmentFiles.storageKey,
        fileName: lessonAssignmentFiles.fileName,
        contentType: lessonAssignmentFiles.contentType,
        sizeBytes: lessonAssignmentFiles.sizeBytes,
      })
      .from(lessonAssignmentFiles)
      .innerJoin(
        lessonAssignments,
        eq(lessonAssignments.id, lessonAssignmentFiles.assignmentId)
      )
      .where(
        and(
          eq(lessonAssignmentFiles.id, fileId),
          eq(lessonAssignments.lessonId, lessonId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Sets the celse's homework, or changes its description: made with the
   * first save (`lesson_assignment.create`), changed by a later one with a
   * different description (`lesson_assignment.update`). A save that changes
   * nothing writes nothing. The description is never copied into the audit
   * log, only its length.
   */
  async save(
    lessonId: string,
    description: string | null,
    write: IAssignmentWrite
  ): Promise<ILessonAssignment> {
    return this.db.transaction(async (tx) => {
      await this.assertLive(tx, lessonId);
      // Two first saves at once: one inserts, the other finds its row.
      const [made] = await tx
        .insert(lessonAssignments)
        .values({ lessonId, description })
        .onConflictDoNothing({ target: lessonAssignments.lessonId })
        .returning();
      if (made) {
        await this.record(tx, write, "create", made.id, {
          lessonId,
          descriptionLength: description?.length ?? 0,
        });
        return (await this.find(lessonId, tx)) as ILessonAssignment;
      }
      const [held] = await this.lock(tx, lessonId);
      if (held.description !== description) {
        await tx
          .update(lessonAssignments)
          .set({ description, updatedAt: new Date() })
          .where(eq(lessonAssignments.id, held.id));
        await this.record(tx, write, "update", held.id, {
          lessonId,
          descriptionLength: {
            from: held.description?.length ?? 0,
            to: description?.length ?? 0,
          },
        });
      }
      return (await this.find(lessonId, tx)) as ILessonAssignment;
    });
  }

  /**
   * Takes the celse's homework off ("Bu celsenin ödevi var" turned off): the
   * row, its files' rows, each file's object marked for removal from storage,
   * and `lesson_assignment.delete` with what went. False when there is none.
   * The talebe's submissions stay: they are theirs.
   */
  async remove(lessonId: string, write: IAssignmentWrite): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await this.assertLive(tx, lessonId);
      const [held] = await this.lock(tx, lessonId);
      if (!held) return false;
      const files = await tx
        .delete(lessonAssignmentFiles)
        .where(eq(lessonAssignmentFiles.assignmentId, held.id))
        .returning();
      await enqueueStorageDeletions(
        tx,
        files.map((file) => file.storageKey),
        "assignment.delete"
      );
      await tx
        .delete(lessonAssignments)
        .where(eq(lessonAssignments.id, held.id));
      await this.record(tx, write, "delete", held.id, {
        lessonId,
        descriptionLength: held.description?.length ?? 0,
        files: files.map((file) => ({
          fileId: file.id,
          fileName: file.fileName,
          sizeBytes: file.sizeBytes,
        })),
      });
      return true;
    });
  }

  /**
   * Adds a stored file to the celse's homework, once its object is in
   * storage: the row, the upload's claim on its object (`claimUpload`) and
   * `lesson_assignment.file_upload`. Homework taken off in the meantime is
   * LESSON_ASSIGNMENT_NOT_FOUND, and the upload's object is then removed.
   */
  async addFile(
    lessonId: string,
    file: IStoredFile,
    write: IAssignmentWrite
  ): Promise<ILessonAssignment> {
    return this.db.transaction(async (tx) => {
      await this.assertLive(tx, lessonId);
      const [held] = await this.lock(tx, lessonId);
      if (!held) throw new LessonAssignmentNotFoundError(lessonId);
      const [row] = await tx
        .insert(lessonAssignmentFiles)
        .values({ assignmentId: held.id, ...file })
        .returning();
      await claimUpload(tx, file.storageKey);
      await tx
        .update(lessonAssignments)
        .set({ updatedAt: new Date() })
        .where(eq(lessonAssignments.id, held.id));
      await this.record(tx, write, "file_upload", held.id, {
        lessonId,
        fileId: row.id,
        fileName: row.fileName,
        contentType: row.contentType,
        sizeBytes: row.sizeBytes,
      });
      return (await this.find(lessonId, tx)) as ILessonAssignment;
    });
  }

  /**
   * Removes a file of the celse's homework: the row, its object marked for
   * removal from storage, `lesson_assignment.file_delete`. False when the
   * homework has no such file.
   */
  async removeFile(
    lessonId: string,
    fileId: string,
    write: IAssignmentWrite
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await this.assertLive(tx, lessonId);
      const [held] = await this.lock(tx, lessonId);
      if (!held) return false;
      const [removed] = await tx
        .delete(lessonAssignmentFiles)
        .where(
          and(
            eq(lessonAssignmentFiles.id, fileId),
            eq(lessonAssignmentFiles.assignmentId, held.id)
          )
        )
        .returning();
      if (!removed) return false;
      await enqueueStorageDeletions(
        tx,
        [removed.storageKey],
        "assignment.file_delete"
      );
      await tx
        .update(lessonAssignments)
        .set({ updatedAt: new Date() })
        .where(eq(lessonAssignments.id, held.id));
      await this.record(tx, write, "file_delete", held.id, {
        lessonId,
        fileId: removed.id,
        fileName: removed.fileName,
        sizeBytes: removed.sizeBytes,
      });
      return true;
    });
  }

  /** The celse is there and not hidden, which every write needs. */
  private async assertLive(tx: Tx, lessonId: string): Promise<void> {
    const [row] = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
      .limit(1);
    if (!row) throw new LessonNotFoundError(lessonId);
  }

  /** The celse's homework row, locked until the transaction ends. */
  private lock(tx: Tx, lessonId: string) {
    return tx
      .select()
      .from(lessonAssignments)
      .where(eq(lessonAssignments.lessonId, lessonId))
      .for("update");
  }

  private async record(
    tx: Tx,
    write: IAssignmentWrite,
    what: "create" | "update" | "delete" | "file_upload" | "file_delete",
    assignmentId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await tx.insert(auditLog).values({
      actorId: write.actorId,
      action: `lesson_assignment.${what}`,
      entity: "lesson_assignment",
      entityId: assignmentId,
      details: { courseId: write.courseId, ...details },
    });
  }
}
