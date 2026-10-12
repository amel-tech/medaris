import type { AuthenticatedUser } from "@medaris/common";
import { Injectable, type StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { CourseService } from "../course/course.service";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import { ObjectStorage } from "../storage/object-storage";
import { StorageDeletionService } from "../storage/storage-deletion.service";
import { submissionFileKey } from "../storage/storage-keys";
import { streamStoredFile } from "../storage/stored-file";
import { acceptUpload, MAX_UPLOAD_BYTES } from "../storage/upload";
import { UploadStore } from "../storage/upload-store";
import type {
  CourseSubmissionsResponse,
  LessonSubmissionResponse,
  OwnSubmissionResponse,
} from "./dto/lesson-submission.dto";
import { MAX_SUBMISSION_FILES } from "./dto/lesson-submission.dto";
import { SubmissionFileLimitError } from "./errors/submission-file-limit.error";
import { SubmissionFileNotFoundError } from "./errors/submission-file-not-found.error";
import { SubmissionForbiddenError } from "./errors/submission-forbidden.error";
import {
  type ISubmission,
  type ISubmissionFile,
  LessonSubmissionRepository,
} from "./lesson-submission.repository";

const ownFileUrl = (lessonId: string, fileId: string) =>
  `/lessons/${lessonId}/submission/files/${fileId}`;
const staffFileUrl = (courseId: string, fileId: string) =>
  `/courses/${courseId}/submissions/files/${fileId}`;

function present(
  submission: ISubmission,
  downloadUrl: (file: ISubmissionFile) => string
): LessonSubmissionResponse {
  return {
    id: submission.id,
    lessonId: submission.lessonId,
    note: submission.note,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    files: submission.files.map((file) => ({
      id: file.id,
      name: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      createdAt: file.createdAt,
      downloadUrl: downloadUrl(file),
    })),
  };
}

/**
 * Homework on a celse (MDRS-290): one per talebe per celse, a note and up to
 * five files in Medaris storage (MDRS-287's store, limits and type checks).
 *
 * The talebe hands it in, changes it and removes their files only while they
 * may write on the course as a talebe (`CourseService.mayWriteAsTalebe`: an
 * ENROLLED or COMPLETED enrollment, no ban, the content open — the rule notes
 * and questions follow), on a live celse. They read their own while the course
 * is open to them (`mayReachOwnWriting`), as with notes. Nobody else reaches it
 * through these routes: another talebe's file, or one asked for by staff, is
 * 403.
 *
 * The course's staff read it through `submission.read` on the course (the
 * routes' `@Authz`): the müderris and the köşk nazımı and başmüderris by role,
 * a ders nazırı when given it, the başnazım. A staff download goes to
 * `audit_log` before the file is sent; uploads and removals always do.
 */
@Injectable()
export class LessonSubmissionService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: LessonSubmissionRepository,
    private readonly courses: CourseService,
    private readonly storage: ObjectStorage,
    private readonly uploads: UploadStore,
    private readonly deletions: StorageDeletionService
  ) {}

  async own(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<OwnSubmissionResponse> {
    await this.assertReachable(user, lessonId);
    const submission = await this.repo.findOwn(lessonId, user.sub);
    return {
      submission: submission
        ? present(submission, (f) => ownFileUrl(lessonId, f.id))
        : null,
      maxFiles: MAX_SUBMISSION_FILES,
      maxFileBytes: MAX_UPLOAD_BYTES,
    };
  }

  async saveNote(
    user: AuthenticatedUser,
    lessonId: string,
    note: string | null
  ): Promise<LessonSubmissionResponse> {
    await this.assertMayWrite(user, lessonId);
    const saved = await this.repo.saveNote(lessonId, user.sub, note);
    return present(saved, (f) => ownFileUrl(lessonId, f.id));
  }

  async addFile(
    user: AuthenticatedUser,
    lessonId: string,
    file: Express.Multer.File | undefined
  ): Promise<LessonSubmissionResponse> {
    this.storage.assertConfigured();
    const courseId = await this.assertMayWrite(user, lessonId);
    // Refused before anything is stored; the write asks again under the lock.
    if (
      (await this.repo.countFiles(lessonId, user.sub)) >= MAX_SUBMISSION_FILES
    ) {
      throw new SubmissionFileLimitError(MAX_SUBMISSION_FILES);
    }
    const accepted = acceptUpload(file);
    const saved = await this.uploads.store(
      submissionFileKey(this.storage.keyPrefix(), courseId, lessonId, user.sub),
      accepted,
      (stored) =>
        this.repo.addFile(
          lessonId,
          user.sub,
          courseId,
          stored,
          MAX_SUBMISSION_FILES
        )
    );
    return present(saved, (f) => ownFileUrl(lessonId, f.id));
  }

  async removeFile(
    user: AuthenticatedUser,
    lessonId: string,
    fileId: string
  ): Promise<void> {
    const courseId = await this.assertMayWrite(user, lessonId);
    await this.ownFile(user, lessonId, fileId);
    if (
      !(await this.repo.removeOwnFile(lessonId, user.sub, courseId, fileId))
    ) {
      throw new SubmissionFileNotFoundError(fileId);
    }
    this.deletions.kick();
  }

  async downloadOwn(
    user: AuthenticatedUser,
    lessonId: string,
    fileId: string,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    await this.assertReachable(user, lessonId);
    const file = await this.ownFile(user, lessonId, fileId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new SubmissionFileNotFoundError(fileId)
    );
  }

  async listForCourse(
    user: AuthenticatedUser,
    courseId: string,
    lessonId?: string
  ): Promise<CourseSubmissionsResponse> {
    // A hidden course or a draft is not found here as on its page.
    await this.courses.getDetail(courseId, user, { read: true });
    const items = await this.repo.listForCourse(courseId, lessonId);
    return {
      items: items.map((item) => ({
        ...present(item, (f) => staffFileUrl(courseId, f.id)),
        lessonTitle: item.lessonTitle,
        weekNumber: item.weekNumber,
        talebe: item.talebe,
      })),
    };
  }

  async downloadForStaff(
    user: AuthenticatedUser,
    courseId: string,
    fileId: string,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    await this.courses.getDetail(courseId, user, { read: true });
    const file = await this.repo.findCourseFile(courseId, fileId);
    if (!file) throw new SubmissionFileNotFoundError(fileId);
    // On the record before a byte is sent: a failed write fails the download.
    await this.repo.recordStaffDownload(user.sub, file, courseId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new SubmissionFileNotFoundError(fileId)
    );
  }

  /** A file of the caller's own homework on the celse; somebody else's is 403. */
  private async ownFile(
    user: AuthenticatedUser,
    lessonId: string,
    fileId: string
  ): Promise<ISubmissionFile> {
    const file = await this.repo.findLessonFile(lessonId, fileId);
    if (!file) throw new SubmissionFileNotFoundError(fileId);
    if (file.userId !== user.sub) throw new SubmissionForbiddenError();
    return file;
  }

  /** The course of a live celse the caller may hand homework in on. */
  private async assertMayWrite(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<string> {
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    if (!(await this.repo.isLiveLesson(lessonId))) {
      throw new LessonNotFoundError(lessonId);
    }
    if (!(await this.courses.mayWriteAsTalebe(user, courseId))) {
      throw new SubmissionForbiddenError();
    }
    return courseId;
  }

  /** The course of a celse whose own homework the caller may still read. */
  private async assertReachable(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<string> {
    const courseId = await this.courses.findVisibleLessonCourse(lessonId, user);
    if (!(await this.courses.mayReachOwnWriting(user, courseId))) {
      throw new SubmissionForbiddenError();
    }
    return courseId;
  }
}
