import { Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import {
  courseWeeks,
  lessonRecordings,
  lessons,
} from "../database/schema/course.schema";
import { LessonType } from "./domain/lesson-type.enum";
import {
  RecordingProvider,
  RecordingStatus,
  type RecordingVisibility,
} from "./domain/recording";
import { LessonCancelledError } from "./errors/lesson-cancelled.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LessonNotLiveError } from "./errors/lesson-not-live.error";
import { RecordingExistsError } from "./errors/recording-exists.error";

const bunnyUploadColumns = {
  id: lessonRecordings.id,
  lessonId: lessonRecordings.lessonId,
  status: lessonRecordings.status,
  bunnyVideoId: lessonRecordings.bunnyVideoId,
  uploadExpiresAt: lessonRecordings.uploadExpiresAt,
};

/** The CHECK constraint makes both columns non-null on a BUNNY row. */
function toBunnyUpload(row: {
  id: string;
  lessonId: string;
  status: RecordingStatus;
  bunnyVideoId: string | null;
  uploadExpiresAt: Date | null;
}): IBunnyUploadRow {
  return {
    id: row.id,
    lessonId: row.lessonId,
    status: row.status,
    bunnyVideoId: row.bunnyVideoId ?? "",
    uploadExpiresAt: row.uploadExpiresAt ?? new Date(0),
  };
}

/** One session's live stream link, as the course staff read and write it (MDRS-228). */
export interface ILiveStreamLink {
  lessonId: string;
  liveStreamUrl: string | null;
}

/** A recording row as stored: the lesson it belongs to, no programme position. */
export interface IStoredRecording {
  id: string;
  lessonId: string;
  title: string;
  provider: RecordingProvider;
  url: string | null;
  durationMinutes: number | null;
  recordedAt: Date | null;
  visibility: RecordingVisibility;
  status: RecordingStatus;
  /** Set on a BUNNY recording only (MDRS-116); never handed to a caller as is. */
  bunnyVideoId: string | null;
}

/** A session's Bunny upload, as the re-sign route and the encoding poll read it (MDRS-116). */
export interface IBunnyUploadRow {
  id: string;
  lessonId: string;
  status: RecordingStatus;
  bunnyVideoId: string;
  uploadExpiresAt: Date;
}

/** What `startBunnyUpload` writes. */
export interface INewBunnyUpload {
  lessonId: string;
  title: string;
  visibility: RecordingVisibility;
  recordedAt: Date | null;
  bunnyVideoId: string;
  uploadExpiresAt: Date;
  actorId: string;
}

/**
 * Reads of the lesson recordings and the live stream link (MDRS-162), and the
 * stream link's one write (MDRS-228). Kept
 * apart from `CourseRepository`: the course detail is built from the lesson
 * rows and these two never ride on it, so a caller who may not read content
 * cannot be handed one by a filter that forgot a key.
 */
@Injectable()
export class RecordingRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  async findByLessonIds(lessonIds: string[]): Promise<IStoredRecording[]> {
    if (lessonIds.length === 0) return [];
    return this.db
      .select({
        id: lessonRecordings.id,
        lessonId: lessonRecordings.lessonId,
        title: lessonRecordings.title,
        provider: lessonRecordings.provider,
        url: lessonRecordings.url,
        durationMinutes: lessonRecordings.durationMinutes,
        recordedAt: lessonRecordings.recordedAt,
        visibility: lessonRecordings.visibility,
        status: lessonRecordings.status,
        bunnyVideoId: lessonRecordings.bunnyVideoId,
      })
      .from(lessonRecordings)
      .where(inArray(lessonRecordings.lessonId, lessonIds));
  }

  /**
   * Records a new Bunny upload of the session (MDRS-116): provider BUNNY,
   * status PROCESSING, the video id Bunny gave and the end of the upload's
   * lifetime, and writes `recording.upload_start` to `audit_log` in the same
   * transaction.
   *
   * The lesson row is locked first, so two uploads started at once for one
   * session are serialised and the second sees the first. A session that
   * already has a recording is refused (`RecordingExistsError`) unless that
   * recording is a Bunny upload that FAILED: that row is reused for the new
   * video, so a failed upload can be retried without anyone deleting it.
   */
  async startBunnyUpload(
    upload: INewBunnyUpload
  ): Promise<{ recordingId: string; courseId: string }> {
    return this.db.transaction(async (tx) => {
      const [lesson] = await tx
        .select({ courseId: courseWeeks.courseId })
        .from(lessons)
        .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
        .where(and(eq(lessons.id, upload.lessonId), isNull(lessons.archivedAt)))
        .limit(1)
        .for("update", { of: lessons });
      if (!lesson) throw new LessonNotFoundError(upload.lessonId);

      const [existing] = await tx
        .select({
          id: lessonRecordings.id,
          provider: lessonRecordings.provider,
          status: lessonRecordings.status,
          bunnyVideoId: lessonRecordings.bunnyVideoId,
        })
        .from(lessonRecordings)
        .where(eq(lessonRecordings.lessonId, upload.lessonId))
        .limit(1);
      const replaceable =
        existing?.provider === RecordingProvider.BUNNY &&
        existing.status === RecordingStatus.FAILED;
      if (existing && !replaceable) {
        throw new RecordingExistsError(upload.lessonId);
      }

      const values = {
        title: upload.title,
        provider: RecordingProvider.BUNNY,
        url: null,
        durationMinutes: null,
        recordedAt: upload.recordedAt,
        visibility: upload.visibility,
        status: RecordingStatus.PROCESSING,
        bunnyVideoId: upload.bunnyVideoId,
        uploadExpiresAt: upload.uploadExpiresAt,
      };
      let recordingId: string;
      if (existing) {
        await tx
          .update(lessonRecordings)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(lessonRecordings.id, existing.id));
        recordingId = existing.id;
      } else {
        const [row] = await tx
          .insert(lessonRecordings)
          .values({ lessonId: upload.lessonId, ...values })
          .returning({ id: lessonRecordings.id });
        recordingId = row.id;
      }

      await tx.insert(auditLog).values({
        actorId: upload.actorId,
        action: "recording.upload_start",
        entity: "lesson",
        entityId: upload.lessonId,
        details: {
          courseId: lesson.courseId,
          recordingId,
          bunnyVideoId: upload.bunnyVideoId,
          visibility: upload.visibility,
          replacedVideoId: existing?.bunnyVideoId ?? null,
        },
      });
      return { recordingId, courseId: lesson.courseId };
    });
  }

  /** The session's Bunny upload of `videoId`, or null. */
  async findBunnyUpload(
    lessonId: string,
    videoId: string
  ): Promise<IBunnyUploadRow | null> {
    const [row] = await this.db
      .select(bunnyUploadColumns)
      .from(lessonRecordings)
      .where(
        and(
          eq(lessonRecordings.lessonId, lessonId),
          eq(lessonRecordings.bunnyVideoId, videoId)
        )
      )
      .limit(1);
    return row ? toBunnyUpload(row) : null;
  }

  /** Bunny uploads still PROCESSING, oldest first, for the encoding poll. */
  async findProcessingBunnyUploads(limit: number): Promise<IBunnyUploadRow[]> {
    const rows = await this.db
      .select(bunnyUploadColumns)
      .from(lessonRecordings)
      .where(
        and(
          eq(lessonRecordings.provider, RecordingProvider.BUNNY),
          eq(lessonRecordings.status, RecordingStatus.PROCESSING)
        )
      )
      .orderBy(asc(lessonRecordings.updatedAt))
      .limit(limit);
    return rows.map(toBunnyUpload);
  }

  /**
   * Moves a Bunny upload out of PROCESSING. Only a row still PROCESSING
   * with this video is touched, so a poll racing a retry of a failed upload
   * cannot settle the new video with the old one's outcome. True when a row
   * changed.
   */
  async settleBunnyUpload(
    id: string,
    videoId: string,
    status: RecordingStatus.READY | RecordingStatus.FAILED,
    durationMinutes: number | null
  ): Promise<boolean> {
    const changed = await this.db
      .update(lessonRecordings)
      .set({
        status,
        ...(durationMinutes !== null ? { durationMinutes } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lessonRecordings.id, id),
          eq(lessonRecordings.bunnyVideoId, videoId),
          eq(lessonRecordings.status, RecordingStatus.PROCESSING)
        )
      )
      .returning({ id: lessonRecordings.id });
    return changed.length > 0;
  }

  async findLiveStreamUrl(lessonId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ url: lessons.liveStreamUrl })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);
    return row?.url ?? null;
  }

  /**
   * The stream links set on the course's sessions that are still in its
   * programme, in programme order, for the staff's Celseler page (MDRS-228).
   * Only the sessions that have one.
   */
  async findLiveStreams(courseId: string): Promise<ILiveStreamLink[]> {
    return this.db
      .select({ lessonId: lessons.id, liveStreamUrl: lessons.liveStreamUrl })
      .from(lessons)
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          isNull(lessons.archivedAt),
          isNotNull(lessons.liveStreamUrl)
        )
      )
      .orderBy(asc(courseWeeks.orderIndex), asc(lessons.orderIndex));
  }

  /**
   * Sets or clears a session's stream link (`url` null) and writes the change
   * to `audit_log` in the same transaction, as a cancellation is (MDRS-176).
   * The lesson row is locked first, so a cancellation racing this one is
   * either seen here or waits for it.
   *
   * The course version is not bumped: the link is no part of the course
   * document `PUT /courses/:id` saves (that save leaves the column alone), so
   * an editor holding the course open is not made to reload for it.
   */
  async setLiveStreamUrl(
    lessonId: string,
    url: string | null,
    actorId: string
  ): Promise<ILiveStreamLink & { courseId: string }> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          courseId: courseWeeks.courseId,
          type: lessons.type,
          cancelledAt: lessons.cancelledAt,
          liveStreamUrl: lessons.liveStreamUrl,
        })
        .from(lessons)
        .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
        .where(and(eq(lessons.id, lessonId), isNull(lessons.archivedAt)))
        .limit(1)
        .for("update", { of: lessons });
      if (!current) throw new LessonNotFoundError(lessonId);
      if (current.type !== LessonType.LIVE) {
        throw new LessonNotLiveError(lessonId);
      }
      if (current.cancelledAt !== null) {
        throw new LessonCancelledError(lessonId);
      }
      await tx
        .update(lessons)
        .set({ liveStreamUrl: url, updatedAt: new Date() })
        .where(eq(lessons.id, lessonId));
      await tx.insert(auditLog).values({
        actorId,
        action:
          url === null ? "lesson.live_stream_clear" : "lesson.live_stream_set",
        entity: "lesson",
        entityId: lessonId,
        details: {
          courseId: current.courseId,
          liveStreamUrl: url,
          previous: current.liveStreamUrl,
        },
      });
      return { lessonId, courseId: current.courseId, liveStreamUrl: url };
    });
  }
}
