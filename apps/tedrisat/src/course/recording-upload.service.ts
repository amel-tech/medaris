import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { uploadExpiry } from "../bunny-stream/bunny-signature";
import {
  BunnyStreamClient,
  type IBunnyUploadAuthorization,
} from "../bunny-stream/bunny-stream.client";
import { CourseRepository } from "./course.repository";
import { CourseAccessService } from "./course-access.service";
import {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "./domain/recording";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { RecordingExistsError } from "./errors/recording-exists.error";
import { RecordingUploadClosedError } from "./errors/recording-upload-closed.error";
import { RecordingUploadNotFoundError } from "./errors/recording-upload-not-found.error";
import { RecordingRepository } from "./recording.repository";

export interface IStartRecordingUpload {
  title: string;
  visibility?: RecordingVisibility;
  recordedAt?: Date;
}

export interface IRecordingUpload extends IBunnyUploadAuthorization {
  recordingId: string;
}

/**
 * Uploading a session's recording to Bunny Stream from the browser (MDRS-116,
 * part A). tedrisat creates the video and signs the TUS upload; the file goes
 * from the browser straight to Bunny and never through this server.
 *
 * Both routes are `recording.upload`'s: the müderris and the köşk nazımı hold
 * it by default, a ders nazırı when given it. It is asked through the
 * permission catalogue (`CourseAccessService`) for the reason
 * `LiveStreamService` gives: the route matrix has no row for a ders nazırı.
 * The permission is asked before anything else is read, so a caller who may
 * not upload learns nothing about the session's recording, and before the
 * library's configuration, so they get 403 rather than 503.
 */
@Injectable()
export class RecordingUploadService {
  // All four must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly access: CourseAccessService,
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository,
    private readonly bunny: BunnyStreamClient
  ) {}

  private async assertMayUpload(
    lessonId: string,
    user: AuthenticatedUser
  ): Promise<void> {
    const courseId = await this.courseRepo.findLessonCourseId(lessonId);
    if (!courseId) throw new LessonNotFoundError(lessonId);
    await this.access.assert(user, courseId, PERMISSIONS.RECORDING_UPLOAD);
    this.bunny.assertConfigured();
  }

  /**
   * Creates the video in Bunny, records it as a PROCESSING recording of the
   * session, and signs its upload for 24 hours.
   *
   * The session (missing or archived) and its existing recording are
   * checked before Bunny is called, so a refused start does not leave an
   * empty video in the library; both checks are made again, under the
   * lesson's lock, when the row is written.
   */
  async start(
    lessonId: string,
    input: IStartRecordingUpload,
    user: AuthenticatedUser,
    now: Date = new Date()
  ): Promise<IRecordingUpload> {
    await this.assertMayUpload(lessonId, user);
    // An archived session is a 404 here, not first in Bunny: the transaction
    // would refuse it anyway, after an empty video had been created.
    if (!(await this.recordings.findOpenLessonCourseId(lessonId))) {
      throw new LessonNotFoundError(lessonId);
    }
    const [existing] = await this.recordings.findByLessonIds([lessonId]);
    if (
      existing &&
      !(
        existing.provider === RecordingProvider.BUNNY &&
        existing.status === RecordingStatus.FAILED
      )
    ) {
      throw new RecordingExistsError(lessonId);
    }

    const videoId = await this.bunny.createVideo(input.title);
    const expiresAt = uploadExpiry(now);
    const { recordingId } = await this.recordings.startBunnyUpload({
      lessonId,
      title: input.title,
      visibility: input.visibility ?? RecordingVisibility.ENROLLED,
      recordedAt: input.recordedAt ?? null,
      bunnyVideoId: videoId,
      uploadExpiresAt: new Date(expiresAt * 1000),
      actorId: user.sub,
    });
    return {
      recordingId,
      ...this.bunny.uploadAuthorization(videoId, expiresAt),
    };
  }

  /**
   * Signs the same video again so an interrupted upload resumes where it
   * stopped. The expiry is the original one: per Bunny's documentation a new
   * signature does not extend an upload's lifetime, so this never claims to.
   */
  async resign(
    lessonId: string,
    videoId: string,
    user: AuthenticatedUser,
    now: Date = new Date()
  ): Promise<IRecordingUpload> {
    await this.assertMayUpload(lessonId, user);
    const upload = await this.recordings.findBunnyUpload(lessonId, videoId);
    if (!upload) throw new RecordingUploadNotFoundError(lessonId, videoId);
    if (upload.status !== RecordingStatus.PROCESSING) {
      throw new RecordingUploadClosedError(videoId, "not-processing");
    }
    if (upload.uploadExpiresAt.getTime() <= now.getTime()) {
      throw new RecordingUploadClosedError(videoId, "expired");
    }
    const expiresAt = Math.floor(upload.uploadExpiresAt.getTime() / 1000);
    return {
      recordingId: upload.id,
      ...this.bunny.uploadAuthorization(videoId, expiresAt),
    };
  }
}
