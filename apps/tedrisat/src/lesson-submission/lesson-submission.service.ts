import type { AuthenticatedUser } from "@medaris/common";
import { Injectable, Logger, type StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { CourseService } from "../course/course.service";
import { LessonNotFoundError } from "../course/errors/lesson-not-found.error";
import { NotificationService } from "../notification/notification.service";
import { ObjectStorage } from "../storage/object-storage";
import { StorageDeletionService } from "../storage/storage-deletion.service";
import {
  submissionFileKey,
  submissionReviewFileKey,
} from "../storage/storage-keys";
import { streamStoredFile } from "../storage/stored-file";
import { acceptUpload, MAX_UPLOAD_BYTES } from "../storage/upload";
import { UploadStore } from "../storage/upload-store";
import type {
  CourseSubmissionsResponse,
  LessonSubmissionResponse,
  MySubmissionsResponse,
  OwnSubmissionResponse,
} from "./dto/lesson-submission.dto";
import {
  MAX_REVIEW_FILES,
  MAX_SUBMISSION_FILES,
} from "./dto/lesson-submission.dto";
import { SubmissionFileLimitError } from "./errors/submission-file-limit.error";
import { SubmissionFileNotFoundError } from "./errors/submission-file-not-found.error";
import { SubmissionForbiddenError } from "./errors/submission-forbidden.error";
import { SubmissionNotFoundError } from "./errors/submission-not-found.error";
import { SubmissionReviewFileLimitError } from "./errors/submission-review-file-limit.error";
import {
  type IStaffSubmission,
  type ISubmission,
  type ISubmissionFile,
  type ISubmissionReviewFile,
  LessonSubmissionRepository,
} from "./lesson-submission.repository";

const ownFileUrl = (lessonId: string, fileId: string) =>
  `/lessons/${lessonId}/submission/files/${fileId}`;
const staffFileUrl = (courseId: string, fileId: string) =>
  `/courses/${courseId}/submissions/files/${fileId}`;
const ownReviewFileUrl = (lessonId: string, fileId: string) =>
  `/lessons/${lessonId}/submission/review-files/${fileId}`;
const staffReviewFileUrl = (courseId: string, fileId: string) =>
  `/courses/${courseId}/submissions/review-files/${fileId}`;

/** Who reads a homework: its talebe sees a review once sent, the course team before. */
type Reader =
  | { kind: "talebe"; lessonId: string }
  | { kind: "staff"; courseId: string };

const fileOf = (
  file: ISubmissionFile | ISubmissionReviewFile,
  downloadUrl: string
) => ({
  id: file.id,
  name: file.fileName,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
  createdAt: file.createdAt,
  downloadUrl,
});

function present(
  submission: ISubmission,
  downloadUrl: (file: ISubmissionFile) => string,
  reader: Reader
): LessonSubmissionResponse {
  const sent = submission.reviewedAt !== null;
  const shown =
    reader.kind === "talebe" ? sent : sent || submission.reviewFiles.length > 0;
  return {
    review: shown
      ? {
          note: sent ? submission.reviewNote : null,
          reviewedAt: submission.reviewedAt,
          reviewer: submission.reviewer,
          files: submission.reviewFiles.map((file) =>
            fileOf(
              file,
              reader.kind === "talebe"
                ? ownReviewFileUrl(reader.lessonId, file.id)
                : staffReviewFileUrl(reader.courseId, file.id)
            )
          ),
        }
      : null,
    id: submission.id,
    lessonId: submission.lessonId,
    note: submission.note,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    files: submission.files.map((file) => fileOf(file, downloadUrl(file))),
  };
}

const talebeReader = (lessonId: string): Reader => ({
  kind: "talebe",
  lessonId,
});

/**
 * Homework on a celse (MDRS-290): one per talebe per celse, a note and up to
 * `MAX_SUBMISSION_FILES` files (10 since MDRS-296) in Medaris storage
 * (MDRS-287's store, limits and type checks).
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
 *
 * The same holders review it: a note and up to five files returned to the
 * talebe ("Değerlendir"). Review files may be added before the review is
 * sent; the talebe sees nothing of it until it is, and is then told
 * (`SUBMISSION_REVIEWED`). Sending again replaces the note.
 */
@Injectable()
export class LessonSubmissionService {
  private readonly logger = new Logger(LessonSubmissionService.name);

  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: LessonSubmissionRepository,
    private readonly courses: CourseService,
    private readonly storage: ObjectStorage,
    private readonly uploads: UploadStore,
    private readonly deletions: StorageDeletionService,
    private readonly notifications: NotificationService
  ) {}

  async own(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<OwnSubmissionResponse> {
    await this.assertReachable(user, lessonId);
    const submission = await this.repo.findOwn(lessonId, user.sub);
    return {
      submission: submission
        ? present(
            submission,
            (f) => ownFileUrl(lessonId, f.id),
            talebeReader(lessonId)
          )
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
    return present(
      saved,
      (f) => ownFileUrl(lessonId, f.id),
      talebeReader(lessonId)
    );
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
    return present(
      saved,
      (f) => ownFileUrl(lessonId, f.id),
      talebeReader(lessonId)
    );
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

  /**
   * The celses of the course the caller handed homework in on, for the
   * course page's marks: "Ödev" on a celse with homework, highlighted where
   * nothing is handed in yet. Only the caller's own, on the terms of their own
   * homework's read (`own`).
   */
  async listOwnForCourse(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<MySubmissionsResponse> {
    await this.courses.getDetail(courseId, user, { read: true });
    if (!(await this.courses.mayReachOwnWriting(user, courseId))) {
      throw new SubmissionForbiddenError();
    }
    return { items: await this.repo.listOwnHandedIn(courseId, user.sub) };
  }

  async listForCourse(
    user: AuthenticatedUser,
    courseId: string,
    lessonId?: string
  ): Promise<CourseSubmissionsResponse> {
    // A hidden course or a draft is not found here as on its page.
    await this.courses.getDetail(courseId, user, { read: true });
    const [items, handIns] = await Promise.all([
      this.repo.listForCourse(courseId, lessonId),
      this.repo.handInsForCourse(courseId, lessonId),
    ]);
    return {
      items: items.map((item) => this.presentForStaff(courseId, item)),
      sessions: handIns.sessions,
      talebeCount: handIns.talebeCount,
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

  /**
   * A review file of the caller's own homework, once the review is sent:
   * somebody else's is 403, and one of a review not sent yet is not found.
   */
  async downloadOwnReviewFile(
    user: AuthenticatedUser,
    lessonId: string,
    fileId: string,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    await this.assertReachable(user, lessonId);
    const file = await this.repo.findLessonReviewFile(lessonId, fileId);
    if (!file || file.reviewedAt === null) {
      throw new SubmissionFileNotFoundError(fileId);
    }
    if (file.userId !== user.sub) throw new SubmissionForbiddenError();
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new SubmissionFileNotFoundError(fileId)
    );
  }

  /** A review file, for the course team: written to `audit_log` first. */
  async downloadReviewFileForStaff(
    user: AuthenticatedUser,
    courseId: string,
    fileId: string,
    response: Response
  ): Promise<StreamableFile> {
    this.storage.assertConfigured();
    await this.courses.getDetail(courseId, user, { read: true });
    const file = await this.repo.findCourseReviewFile(courseId, fileId);
    if (!file) throw new SubmissionFileNotFoundError(fileId);
    await this.repo.recordReviewFileDownload(user.sub, file, courseId);
    return streamStoredFile(
      this.storage,
      file,
      response,
      () => new SubmissionFileNotFoundError(fileId)
    );
  }

  /** Adds a file to the review of a homework on a live celse of the course. */
  async addReviewFile(
    user: AuthenticatedUser,
    courseId: string,
    submissionId: string,
    file: Express.Multer.File | undefined
  ) {
    this.storage.assertConfigured();
    const ref = await this.reviewable(user, courseId, submissionId);
    // Refused before anything is stored; the write asks again under the lock.
    if ((await this.repo.countReviewFiles(submissionId)) >= MAX_REVIEW_FILES) {
      throw new SubmissionReviewFileLimitError(MAX_REVIEW_FILES);
    }
    const accepted = acceptUpload(file);
    await this.uploads.store(
      submissionReviewFileKey(
        this.storage.keyPrefix(),
        courseId,
        ref.lessonId,
        ref.userId
      ),
      accepted,
      (stored) =>
        this.repo.addReviewFile(
          submissionId,
          user.sub,
          courseId,
          stored,
          MAX_REVIEW_FILES
        )
    );
    return this.staffSubmission(courseId, submissionId);
  }

  async removeReviewFile(
    user: AuthenticatedUser,
    courseId: string,
    submissionId: string,
    fileId: string
  ): Promise<void> {
    await this.reviewable(user, courseId, submissionId);
    if (
      !(await this.repo.removeReviewFile(
        submissionId,
        user.sub,
        courseId,
        fileId
      ))
    ) {
      throw new SubmissionFileNotFoundError(fileId);
    }
    this.deletions.kick();
  }

  /**
   * Sends the review to the talebe (or sends it again, replacing the note),
   * and tells them. A failed notification is logged, never the caller's
   * error: the review is saved.
   */
  async sendReview(
    user: AuthenticatedUser,
    courseId: string,
    submissionId: string,
    note: string | null
  ) {
    const ref = await this.reviewable(user, courseId, submissionId);
    await this.repo.sendReview(submissionId, user.sub, courseId, note);
    if (ref.userId !== user.sub) {
      try {
        const course = await this.courses.getDetail(courseId, user, {
          read: true,
        });
        await this.notifications.notify({
          userId: ref.userId,
          type: "SUBMISSION_REVIEWED",
          targetType: "SESSION",
          targetId: ref.lessonId,
          params: {
            courseId,
            courseTitle: course.title,
            sessionLabel: ref.lessonTitle,
          },
        });
      } catch (error) {
        this.logger.error(
          `Could not notify of the review of ${submissionId}`,
          error
        );
      }
    }
    return this.staffSubmission(courseId, submissionId);
  }

  /** The homework, on a live celse of a course the caller may see. */
  private async reviewable(
    user: AuthenticatedUser,
    courseId: string,
    submissionId: string
  ) {
    // A hidden course or a draft is not found here as on its page.
    await this.courses.getDetail(courseId, user, { read: true });
    const ref = await this.repo.findCourseSubmission(courseId, submissionId);
    if (!ref) throw new SubmissionNotFoundError(submissionId);
    return ref;
  }

  private async staffSubmission(courseId: string, submissionId: string) {
    const item = await this.repo.findStaffSubmission(courseId, submissionId);
    if (!item) throw new SubmissionNotFoundError(submissionId);
    return this.presentForStaff(courseId, item);
  }

  private presentForStaff(courseId: string, item: IStaffSubmission) {
    return {
      ...present(item, (f) => staffFileUrl(courseId, f.id), {
        kind: "staff",
        courseId,
      }),
      lessonTitle: item.lessonTitle,
      weekNumber: item.weekNumber,
      talebe: item.talebe,
    };
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
