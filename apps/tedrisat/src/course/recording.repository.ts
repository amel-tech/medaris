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
  applyRecordingPatch,
  type IRecordingPatch,
  type IRecordingRow,
  type RecordingProvider,
  RecordingStatus,
  type RecordingVisibility,
} from "./domain/recording";
import { LessonCancelledError } from "./errors/lesson-cancelled.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LessonNotLiveError } from "./errors/lesson-not-live.error";
import { RecordingExistsError } from "./errors/recording-exists.error";
import { RecordingNotFoundError } from "./errors/recording-not-found.error";

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
}

/**
 * Reads of the lesson recordings and the live stream link (MDRS-162), the
 * stream link's one write (MDRS-228), and the writes of a pasted recording
 * link (MDRS-247). Kept
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
      })
      .from(lessonRecordings)
      .where(inArray(lessonRecordings.lessonId, lessonIds));
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

  /** The course a recording belongs to, archived lessons included; null when there is none. */
  async findRecordingCourseId(recordingId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: courseWeeks.courseId })
      .from(lessonRecordings)
      .innerJoin(lessons, eq(lessonRecordings.lessonId, lessons.id))
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(eq(lessonRecordings.id, recordingId))
      .limit(1);
    return row?.courseId ?? null;
  }

  /**
   * Adds the recording of a session: a pasted link, READY at once. The lesson
   * row is locked first, so two writers cannot both find it without one. A
   * session that is archived is not there, a cancelled one has nothing to
   * record, and one that has a recording keeps it (`RecordingExistsError`).
   * Written to `audit_log` in the same transaction. The course version is
   * not bumped: recordings are no part of the course document.
   */
  async create(input: {
    lessonId: string;
    title: string;
    url: string;
    provider: RecordingProvider;
    visibility: RecordingVisibility;
    actorId: string;
  }): Promise<IRecordingRow> {
    return this.db.transaction(async (tx) => {
      const [at] = await tx
        .select({
          courseId: courseWeeks.courseId,
          weekId: courseWeeks.id,
          weekNumber: courseWeeks.weekNumber,
          weekTitle: courseWeeks.title,
          scheduledAt: lessons.scheduledAt,
          durationMinutes: lessons.durationMinutes,
          cancelledAt: lessons.cancelledAt,
        })
        .from(lessons)
        .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
        .where(and(eq(lessons.id, input.lessonId), isNull(lessons.archivedAt)))
        .limit(1)
        .for("update", { of: lessons });
      if (!at) throw new LessonNotFoundError(input.lessonId);
      if (at.cancelledAt !== null) {
        throw new LessonCancelledError(input.lessonId);
      }
      const [existing] = await tx
        .select({ id: lessonRecordings.id })
        .from(lessonRecordings)
        .where(eq(lessonRecordings.lessonId, input.lessonId))
        .limit(1);
      if (existing) throw new RecordingExistsError(input.lessonId, existing.id);

      const [row] = await tx
        .insert(lessonRecordings)
        .values({
          lessonId: input.lessonId,
          title: input.title,
          provider: input.provider,
          url: input.url,
          visibility: input.visibility,
          status: RecordingStatus.READY,
          recordedAt: at.scheduledAt ?? new Date(),
          durationMinutes: at.durationMinutes,
        })
        .returning();
      await tx.insert(auditLog).values({
        actorId: input.actorId,
        action: "recording.add",
        entity: "lesson_recording",
        entityId: row.id,
        details: {
          courseId: at.courseId,
          lessonId: input.lessonId,
          provider: input.provider,
          visibility: input.visibility,
          url: input.url,
        },
      });
      return {
        ...row,
        weekId: at.weekId,
        weekNumber: at.weekNumber,
        weekTitle: at.weekTitle,
      };
    });
  }

  /**
   * Changes a recording's title, link or visibility and audits it. The row is
   * locked, and `applyRecordingPatch` decides what the patch leaves behind
   * (the provider follows the link; YouTube stays PUBLIC). A recording whose
   * lesson is archived is not there.
   */
  async update(
    recordingId: string,
    patch: IRecordingPatch,
    actorId: string
  ): Promise<IRecordingRow> {
    return this.db.transaction(async (tx) => {
      const [at] = await tx
        .select({
          recording: lessonRecordings,
          courseId: courseWeeks.courseId,
          weekId: courseWeeks.id,
          weekNumber: courseWeeks.weekNumber,
          weekTitle: courseWeeks.title,
        })
        .from(lessonRecordings)
        .innerJoin(lessons, eq(lessonRecordings.lessonId, lessons.id))
        .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
        .where(
          and(eq(lessonRecordings.id, recordingId), isNull(lessons.archivedAt))
        )
        .limit(1)
        .for("update", { of: lessonRecordings });
      if (!at) throw new RecordingNotFoundError(recordingId);
      const before = at.recording;
      const next = applyRecordingPatch(
        {
          title: before.title,
          url: before.url ?? "",
          visibility: before.visibility,
          provider: before.provider,
        },
        patch
      );
      const [row] = await tx
        .update(lessonRecordings)
        .set({
          title: next.title,
          url: next.url,
          visibility: next.visibility,
          provider: next.provider,
          // A link that is replaced is a link that plays.
          status:
            patch.url === undefined ? before.status : RecordingStatus.READY,
          updatedAt: new Date(),
        })
        .where(eq(lessonRecordings.id, recordingId))
        .returning();
      await tx.insert(auditLog).values({
        actorId,
        action: "recording.update",
        entity: "lesson_recording",
        entityId: recordingId,
        details: {
          courseId: at.courseId,
          lessonId: before.lessonId,
          previous: {
            title: before.title,
            url: before.url,
            visibility: before.visibility,
          },
          next: { title: row.title, url: row.url, visibility: row.visibility },
        },
      });
      return {
        ...row,
        weekId: at.weekId,
        weekNumber: at.weekNumber,
        weekTitle: at.weekTitle,
      };
    });
  }
}
