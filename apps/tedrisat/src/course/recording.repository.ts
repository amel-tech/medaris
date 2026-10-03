import { Injectable } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { lessonRecordings, lessons } from "../database/schema/course.schema";
import type {
  RecordingProvider,
  RecordingStatus,
  RecordingVisibility,
} from "./domain/recording";

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
 * Reads of the lesson recordings and the live stream link (MDRS-162). Kept
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
}
