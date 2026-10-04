import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { displayNameOf } from "../assignment/assignment.service";
import { DatabaseService } from "../database/database.service";
import { courseWeeks, lessons } from "../database/schema/course.schema";
import { lessonQuestions } from "../database/schema/lesson-question.schema";
import { users } from "../database/schema/user.schema";
import type { IQuestionCursor } from "./lesson-question-cursor";

export interface IQuestionPerson {
  id: string;
  name: string | null;
}

/** A question with the session it is on and the people it names. */
export interface ILessonQuestion {
  id: string;
  lessonId: string;
  lessonTitle: string;
  weekNumber: number;
  body: string;
  createdAt: Date;
  author: IQuestionPerson;
  answer: {
    body: string;
    answeredAt: Date;
    answeredBy: IQuestionPerson;
  } | null;
}

/** One page of rows; `next` is set when more follow it. */
export interface IQuestionPage {
  items: ILessonQuestion[];
  next: IQuestionCursor | null;
}

const asker = alias(users, "asker");
const answerer = alias(users, "answerer");

const columns = {
  id: lessonQuestions.id,
  lessonId: lessonQuestions.lessonId,
  lessonTitle: lessons.title,
  weekNumber: courseWeeks.weekNumber,
  body: lessonQuestions.body,
  createdAt: lessonQuestions.createdAt,
  createdAtText: sql<string>`${lessonQuestions.createdAt}::text`,
  authorId: lessonQuestions.authorId,
  authorGiven: asker.givenName,
  authorFamily: asker.familyName,
  authorEmail: asker.email,
  answer: lessonQuestions.answer,
  answeredAt: lessonQuestions.answeredAt,
  answeredBy: lessonQuestions.answeredBy,
  answererGiven: answerer.givenName,
  answererFamily: answerer.familyName,
  answererEmail: answerer.email,
};

interface Row {
  id: string;
  lessonId: string;
  lessonTitle: string;
  weekNumber: number;
  body: string;
  createdAt: Date;
  createdAtText: string;
  authorId: string;
  authorGiven: string | null;
  authorFamily: string | null;
  authorEmail: string | null;
  answer: string | null;
  answeredAt: Date | null;
  answeredBy: string | null;
  answererGiven: string | null;
  answererFamily: string | null;
  answererEmail: string | null;
}

function present(row: Row): ILessonQuestion {
  return {
    id: row.id,
    lessonId: row.lessonId,
    lessonTitle: row.lessonTitle,
    weekNumber: row.weekNumber,
    body: row.body,
    createdAt: row.createdAt,
    author: {
      id: row.authorId,
      name: displayNameOf({
        givenName: row.authorGiven,
        familyName: row.authorFamily,
        email: row.authorEmail,
      }),
    },
    answer:
      row.answer !== null && row.answeredAt !== null && row.answeredBy !== null
        ? {
            body: row.answer,
            answeredAt: row.answeredAt,
            answeredBy: {
              id: row.answeredBy,
              name: displayNameOf({
                givenName: row.answererGiven,
                familyName: row.answererFamily,
                email: row.answererEmail,
              }),
            },
          }
        : null,
  };
}

/**
 * Questions are read by their author and by the course staff, and nobody else
 * (MDRS-150): the one query that reads a course's questions is the staff
 * list, which the service only calls for a holder of `question.answer`; the
 * author's list always carries the author's id.
 */
@Injectable()
export class LessonQuestionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  private selected() {
    return this.db
      .select(columns)
      .from(lessonQuestions)
      .innerJoin(lessons, eq(lessonQuestions.lessonId, lessons.id))
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .leftJoin(asker, eq(lessonQuestions.authorId, asker.id))
      .leftJoin(answerer, eq(lessonQuestions.answeredBy, answerer.id));
  }

  /**
   * The author's questions in one course, newest first, `limit` at a time
   * after `cursor`. Ties on the timestamp are broken by the id, so a page
   * boundary never splits or repeats two questions asked in the same instant.
   */
  async findByAuthor(
    courseId: string,
    authorId: string,
    cursor: IQuestionCursor | null,
    limit: number
  ): Promise<IQuestionPage> {
    const after: SQL | undefined = cursor
      ? sql`(${lessonQuestions.createdAt}, ${lessonQuestions.id}) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const rows = await this.selected()
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          eq(lessonQuestions.authorId, authorId),
          after
        )
      )
      .orderBy(desc(lessonQuestions.createdAt), desc(lessonQuestions.id))
      .limit(limit + 1);
    return this.page(rows, limit);
  }

  /**
   * The course's questions: those waiting first, oldest first, `limit` at a
   * time after `cursor`. The position is `(answered, created_at, id)`.
   */
  async findByCourse(
    courseId: string,
    cursor: IQuestionCursor | null,
    limit: number
  ): Promise<IQuestionPage> {
    const after: SQL | undefined = cursor
      ? sql`(${lessonQuestions.answeredAt} is not null, ${lessonQuestions.createdAt}, ${lessonQuestions.id}) > (${cursor.answered}::boolean, ${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const rows = await this.selected()
      .where(and(eq(courseWeeks.courseId, courseId), after))
      .orderBy(
        sql`${lessonQuestions.answeredAt} is not null`,
        asc(lessonQuestions.createdAt),
        asc(lessonQuestions.id)
      )
      .limit(limit + 1);
    return this.page(rows, limit);
  }

  /** Rows read with one more than `limit`: the extra one only says that a page follows. */
  private page(rows: Row[], limit: number): IQuestionPage {
    const shown = rows.slice(0, limit);
    const last = shown[shown.length - 1];
    return {
      items: shown.map(present),
      next:
        rows.length > limit && last
          ? {
              answered: last.answeredAt !== null,
              createdAt: last.createdAtText,
              id: last.id,
            }
          : null,
    };
  }

  async findOne(questionId: string): Promise<ILessonQuestion | null> {
    const [row] = await this.selected()
      .where(eq(lessonQuestions.id, questionId))
      .limit(1);
    return row ? present(row) : null;
  }

  /** The course a question belongs to; null when there is no such question. */
  async findCourseId(questionId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: courseWeeks.courseId })
      .from(lessonQuestions)
      .innerJoin(lessons, eq(lessonQuestions.lessonId, lessons.id))
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(eq(lessonQuestions.id, questionId))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** The course and the author of a question; null when there is no such question. */
  async findOwnership(
    questionId: string
  ): Promise<{ courseId: string; authorId: string } | null> {
    const [row] = await this.db
      .select({
        courseId: courseWeeks.courseId,
        authorId: lessonQuestions.authorId,
      })
      .from(lessonQuestions)
      .innerJoin(lessons, eq(lessonQuestions.lessonId, lessons.id))
      .innerJoin(courseWeeks, eq(lessons.weekId, courseWeeks.id))
      .where(eq(lessonQuestions.id, questionId))
      .limit(1);
    return row ?? null;
  }

  async insert(
    lessonId: string,
    authorId: string,
    body: string
  ): Promise<string> {
    const [row] = await this.db
      .insert(lessonQuestions)
      .values({ lessonId, authorId, body })
      .returning({ id: lessonQuestions.id });
    return row.id;
  }

  /** Sets the answer, replacing an earlier one; false when the question is gone. */
  async setAnswer(
    questionId: string,
    answeredBy: string,
    body: string
  ): Promise<boolean> {
    const now = new Date();
    const rows = await this.db
      .update(lessonQuestions)
      .set({
        answer: body,
        answeredBy,
        answeredAt: now,
        updatedAt: now,
      })
      .where(eq(lessonQuestions.id, questionId))
      .returning({ id: lessonQuestions.id });
    return rows.length > 0;
  }

  /**
   * Rewrites the author's own question while nobody has answered it; false
   * when there is no such question of theirs or it has been answered.
   */
  async updateBody(
    questionId: string,
    authorId: string,
    body: string
  ): Promise<boolean> {
    const rows = await this.db
      .update(lessonQuestions)
      .set({ body, updatedAt: new Date() })
      .where(
        and(
          eq(lessonQuestions.id, questionId),
          eq(lessonQuestions.authorId, authorId),
          isNull(lessonQuestions.answeredAt)
        )
      )
      .returning({ id: lessonQuestions.id });
    return rows.length > 0;
  }

  /** Removes the author's own question with its answer; false when they have no such question. */
  async remove(questionId: string, authorId: string): Promise<boolean> {
    const rows = await this.db
      .delete(lessonQuestions)
      .where(
        and(
          eq(lessonQuestions.id, questionId),
          eq(lessonQuestions.authorId, authorId)
        )
      )
      .returning({ id: lessonQuestions.id });
    return rows.length > 0;
  }
}
