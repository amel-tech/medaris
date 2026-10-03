import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { displayNameOf } from "../assignment/assignment.service";
import { DatabaseService } from "../database/database.service";
import { courseWeeks, lessons } from "../database/schema/course.schema";
import { lessonQuestions } from "../database/schema/lesson-question.schema";
import { users } from "../database/schema/user.schema";

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

const asker = alias(users, "asker");
const answerer = alias(users, "answerer");

const columns = {
  id: lessonQuestions.id,
  lessonId: lessonQuestions.lessonId,
  lessonTitle: lessons.title,
  weekNumber: courseWeeks.weekNumber,
  body: lessonQuestions.body,
  createdAt: lessonQuestions.createdAt,
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

  /** The author's questions in one course, newest first. */
  async findByAuthor(
    courseId: string,
    authorId: string
  ): Promise<ILessonQuestion[]> {
    const rows = await this.selected()
      .where(
        and(
          eq(courseWeeks.courseId, courseId),
          eq(lessonQuestions.authorId, authorId)
        )
      )
      .orderBy(desc(lessonQuestions.createdAt), desc(lessonQuestions.id));
    return rows.map(present);
  }

  /** Every question in the course: those waiting first, oldest first. */
  async findByCourse(courseId: string): Promise<ILessonQuestion[]> {
    const rows = await this.selected()
      .where(eq(courseWeeks.courseId, courseId))
      .orderBy(
        sql`${lessonQuestions.answeredAt} is not null`,
        asc(lessonQuestions.createdAt),
        asc(lessonQuestions.id)
      );
    return rows.map(present);
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
}
