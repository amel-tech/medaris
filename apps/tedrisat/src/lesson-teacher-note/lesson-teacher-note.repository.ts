import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { lessonTeacherNotes } from "../database/schema/lesson-teacher-note.schema";

export interface ILessonTeacherNote {
  lessonId: string;
  body: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class LessonTeacherNoteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The note as it stands; a session with none reads as an empty one. */
  async find(lessonId: string): Promise<ILessonTeacherNote> {
    const [row] = await this.db
      .select({
        body: lessonTeacherNotes.body,
        updatedAt: lessonTeacherNotes.updatedAt,
      })
      .from(lessonTeacherNotes)
      .where(eq(lessonTeacherNotes.lessonId, lessonId))
      .limit(1);
    return {
      lessonId,
      body: row?.body ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Writes the note over the one before it. */
  async save(lessonId: string, userId: string, body: string): Promise<void> {
    await this.db
      .insert(lessonTeacherNotes)
      .values({ lessonId, body, updatedBy: userId })
      .onConflictDoUpdate({
        target: lessonTeacherNotes.lessonId,
        set: { body, updatedBy: userId, updatedAt: new Date() },
      });
  }

  async remove(lessonId: string): Promise<void> {
    await this.db
      .delete(lessonTeacherNotes)
      .where(eq(lessonTeacherNotes.lessonId, lessonId));
  }
}
