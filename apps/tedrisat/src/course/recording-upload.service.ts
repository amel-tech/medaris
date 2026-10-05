import { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { uploadExpiry } from "../bunny-stream/bunny-signature";
import {
  BunnyStreamClient,
  type IBunnyUploadAuthorization,
} from "../bunny-stream/bunny-stream.client";
import { CourseRepository } from "./course.repository";
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
 * it by default, a ders nazırı when given it. The routes ask it in their
 * `@Authz` on the lesson's course, so by the time a handler runs the caller
 * holds it: a caller who may not upload learns nothing about the session's
 * recording, and gets 403 rather than 503 when the library is not configured.
 * What is left here is existence, which the başnazım's bypass skips in the
 * guard, and the library's configuration.
 */
@Injectable()
export class RecordingUploadService {
  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly recordings: RecordingRepository,
    private readonly bunny: BunnyStreamClient
  ) {}

  private async assertLessonAndLibrary(lessonId: string): Promise<void> {
    if (!(await this.courseRepo.findLessonCourseId(lessonId))) {
      throw new LessonNotFoundError(lessonId);
    }
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
    await this.assertLessonAndLibrary(lessonId);
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
    await this.assertLessonAndLibrary(lessonId);
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
