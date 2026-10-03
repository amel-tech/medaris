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
import type {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "./domain/recording";
import { LessonCancelledError } from "./errors/lesson-cancelled.error";
import { LessonNotFoundError } from "./errors/lesson-not-found.error";
import { LessonNotLiveError } from "./errors/lesson-not-live.error";

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
}
