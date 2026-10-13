import type { AuthenticatedUser } from "@medaris/common";
import { Injectable, type StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { ObjectStorage } from "../storage/object-storage";
import { StorageDeletionService } from "../storage/storage-deletion.service";
import { lessonAssignmentFileKey } from "../storage/storage-keys";
import { streamStoredFile } from "../storage/stored-file";
import { acceptUpload } from "../storage/upload";
import { UploadStore } from "../storage/upload-store";
import { CourseService } from "./course.service";
import type { ILessonAssignment } from "./domain/lesson-assignment";
import { LessonAssignmentFileNotFoundError } from "./errors/lesson-assignment-file-not-found.error";
import { LessonAssignmentNotFoundError } from "./errors/lesson-assignment-not-found.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LessonAssignmentRepository } from "./lesson-assignment.repository";

/**
 * The homework a müderris sets on a celse. The owner, 2026-10-12: "ders/celse
 * kaynağı ile ödev yükleme ve gösterim alanları ayrı olsun, ödevin ödev
 * olduğu anlaşılsın". So a celse's homework is its own thing beside its
 * resources: an on/off, an optional description and its own files, which go
 * through the resources' upload pipeline (`acceptUpload`, `UploadStore`: the
 * same 25 MB and the same types read from the bytes) and are never listed
 * among them. No deadline and no grade.
 *
 * Writing is the permission that edits the celse's resources,
 * `session.manage` (on the route), on a live celse of a course the caller
 * may write to (`CourseService.findWritableLessonCourse`). Reading is the
 * course content's: the course and session reads carry it to whoever may
 * read the content, and a file downloads on the terms of a celse resource's
 * file, as an attachment through tedrisat.
 */
@Injectable()
export class LessonAssignmentService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courses: CourseService,
    private readonly repo: LessonAssignmentRepository,
    private readonly storage: ObjectStorage,
    private readonly uploads: UploadStore,
    private readonly deletions: StorageDeletionService
  ) {}

  async save(
    lessonId: string,
    user: AuthenticatedUser,
    description: string | null
  ): Promise<ILessonAssignment> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    return this.repo.save(lessonId, description, {
      courseId,
      actorId: user.sub,
    });
  }

  async remove(lessonId: string, user: AuthenticatedUser): Promise<void> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    if (!(await this.repo.remove(lessonId, { courseId, actorId: user.sub }))) {
      throw new LessonAssignmentNotFoundError(lessonId);
    }
    this.deletions.kick();
  }

  async addFile(
    lessonId: string,
    user: AuthenticatedUser,
    file: Express.Multer.File | undefined
  ): Promise<ILessonAssignment> {
    this.storage.assertConfigured();
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    // Refused before anything is stored; the write asks again under the lock.
    if (!(await this.repo.find(lessonId))) {
      throw new LessonAssignmentNotFoundError(lessonId);
    }
    const accepted = acceptUpload(file);
    return this.uploads.store(
      lessonAssignmentFileKey(this.storage.keyPrefix(), courseId, lessonId),
      accepted,
      (stored) =>
        this.repo.addFile(lessonId, stored, { courseId, actorId: user.sub })
    );
  }

  async removeFile(
    lessonId: string,
    user: AuthenticatedUser,
    fileId: string
  ): Promise<void> {
    const courseId = await this.courses.findWritableLessonCourse(
      lessonId,
      user
    );
    if (
      !(await this.repo.removeFile(lessonId, fileId, {
        courseId,
        actorId: user.sub,
      }))
    ) {
      throw new LessonAssignmentFileNotFoundError(fileId);
    }
    this.deletions.kick();
  }

  /**
   * A homework file, on the terms of a celse resource's file (MDRS-287): to a
   * reader of the course's content, read like the course page (so a content
   * read by someone who is neither an enrolled talebe nor a müderris goes on
   * the record), and only while the celse is live.
   */
  async download(
    lessonId: string,
    fileId: string,
    user: AuthenticatedUser,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    const detail = await this.courses.viewDetail(courseId, user, {
      audit: true,
      via: "assignment.download",
    });
    const live = detail.weeks.some((week) =>
      week.lessons.some((lesson) => lesson.id === lessonId)
    );
    if (!live) throw new LessonNotFoundError(lessonId);
    const file = detail.contentLocked
      ? null
      : await this.repo.findFile(lessonId, fileId);
    if (!file) throw new LessonAssignmentFileNotFoundError(fileId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new LessonAssignmentFileNotFoundError(fileId)
    );
  }
}
