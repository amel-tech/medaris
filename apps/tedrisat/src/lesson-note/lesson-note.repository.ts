import { Injectable } from "@nestjs/common";
import { and, asc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { lessonNotes } from "../database/schema/lesson-note.schema";

/** A note as stored. */
export interface ILessonNote {
  id: string;
  lessonId: string;
  offsetSeconds: number | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

const columns = {
  id: lessonNotes.id,
  lessonId: lessonNotes.lessonId,
  offsetSeconds: lessonNotes.offsetSeconds,
  body: lessonNotes.body,
  createdAt: lessonNotes.createdAt,
  updatedAt: lessonNotes.updatedAt,
};

/**
 * Notes are private to their author (MDRS-150), and this is where that is
 * kept: there is no method here that reads or writes a note without an
 * `authorId`. A caller cannot ask for somebody else's note by id, only for its
 * own, so "not yours" and "not there" are the same empty result.
 */
@Injectable()
export class LessonNoteRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The author's notes on one session, by position, those without one last. */
  async findByAuthor(
    lessonId: string,
    authorId: string
  ): Promise<ILessonNote[]> {
    return this.db
      .select(columns)
      .from(lessonNotes)
      .where(
        and(
          eq(lessonNotes.lessonId, lessonId),
          eq(lessonNotes.authorId, authorId)
        )
      )
      .orderBy(
        sql`${lessonNotes.offsetSeconds} asc nulls last`,
        asc(lessonNotes.createdAt),
        asc(lessonNotes.id)
      );
  }

  async insert(
    lessonId: string,
    authorId: string,
    values: { body: string; offsetSeconds: number | null }
  ): Promise<ILessonNote> {
    const [row] = await this.db
      .insert(lessonNotes)
      .values({ lessonId, authorId, ...values })
      .returning(columns);
    return row;
  }

  /** Null when the author has no such note on the session. */
  async update(
    noteId: string,
    lessonId: string,
    authorId: string,
    changes: { body?: string; offsetSeconds?: number | null }
  ): Promise<ILessonNote | null> {
    const own = and(
      eq(lessonNotes.id, noteId),
      eq(lessonNotes.lessonId, lessonId),
      eq(lessonNotes.authorId, authorId)
    );
    const set: Partial<typeof lessonNotes.$inferInsert> = {};
    if (changes.body !== undefined) set.body = changes.body;
    if (changes.offsetSeconds !== undefined) {
      set.offsetSeconds = changes.offsetSeconds;
    }
    if (Object.keys(set).length === 0) {
      const [row] = await this.db
        .select(columns)
        .from(lessonNotes)
        .where(own)
        .limit(1);
      return row ?? null;
    }
    const [row] = await this.db
      .update(lessonNotes)
      .set({ ...set, updatedAt: new Date() })
      .where(own)
      .returning(columns);
    return row ?? null;
  }

  /** Whether a note went: false when the author has no such note on the session. */
  async remove(
    noteId: string,
    lessonId: string,
    authorId: string
  ): Promise<boolean> {
    const rows = await this.db
      .delete(lessonNotes)
      .where(
        and(
          eq(lessonNotes.id, noteId),
          eq(lessonNotes.lessonId, lessonId),
          eq(lessonNotes.authorId, authorId)
        )
      )
      .returning({ id: lessonNotes.id });
    return rows.length > 0;
  }
}
