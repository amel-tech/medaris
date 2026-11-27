import { Injectable } from "@nestjs/common";
import {
  and,
  count,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { displayNameOf } from "../assignment/assignment.service";
import { DatabaseService } from "../database/database.service";
import { auditLog } from "../database/schema/audit.schema";
import { lessons } from "../database/schema/course.schema";
import { examAttempts } from "../database/schema/exam-attempt.schema";
import { lessonExams } from "../database/schema/lesson-exam.schema";
import {
  examQuestions,
  onlineExams,
} from "../database/schema/online-exam.schema";
import { practiceAttempts } from "../database/schema/practice.schema";
import { questionNotes } from "../database/schema/question-note.schema";
import { users } from "../database/schema/user.schema";
import { ExamKind } from "../online-exam/domain/online-exam";
import type { IQuestionNote } from "./domain/question-note";

type Db = DatabaseService["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A question with what a note on it is decided by. */
export interface INoteQuestion {
  questionId: string;
  questionText: string;
  talebeNotes: boolean;
  examId: string;
  courseId: string;
  kind: ExamKind;
  examTitle: string;
  publishedAt: Date | null;
  lessonId: string | null;
  /** The exam's celse start; null for a çalışma seti. */
  startsAt: Date | null;
  latestStartAt: Date | null;
  closedEarlyAt: Date | null;
  durationMinutes: number | null;
}

/** One of a talebe's notes with its question and its set. */
export interface IMyNoteRow extends IQuestionNote {
  questionText: string;
  examKind: ExamKind;
  setTitle: string;
  lessonId: string | null;
}

/** A note sent to the hoca, with its question and its talebe. */
export interface ITeacherNoteRow extends IQuestionNote {
  questionText: string;
  questionNumber: number;
  talebeName: string | null;
}

/**
 * Soru notları (MDRS-248): a talebe's notes on the questions they solved or
 * sat, and the hoca's answers. Every read of a talebe's notes carries the
 * talebe's id; the one read of other people's notes is the set's list for
 * its hoca, which holds only the notes sent to them.
 */
@Injectable()
export class QuestionNoteRepository {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.db;
  }

  /** The question and its set or exam; null when there is no such question. */
  async findQuestion(questionId: string): Promise<INoteQuestion | null> {
    const [row] = await this.db
      .select({
        questionId: examQuestions.id,
        questionText: examQuestions.text,
        talebeNotes: examQuestions.talebeNotes,
        examId: onlineExams.id,
        courseId: onlineExams.courseId,
        kind: onlineExams.kind,
        examTitle: onlineExams.title,
        publishedAt: onlineExams.publishedAt,
        lessonId: onlineExams.lessonId,
        startsAt: lessons.scheduledAt,
        latestStartAt: onlineExams.latestStartAt,
        closedEarlyAt: onlineExams.closedEarlyAt,
        durationMinutes: onlineExams.durationMinutes,
      })
      .from(examQuestions)
      .innerJoin(onlineExams, eq(onlineExams.id, examQuestions.examId))
      .leftJoin(lessons, eq(lessons.id, onlineExams.lessonId))
      .where(eq(examQuestions.id, questionId))
      .limit(1);
    return row ?? null;
  }

  /** The course of a set or an exam; null when there is none. */
  async findExamCourse(examId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: onlineExams.courseId })
      .from(onlineExams)
      .where(eq(onlineExams.id, examId))
      .limit(1);
    return row?.courseId ?? null;
  }

  /** The course of a question; null when there is none. */
  async findQuestionCourse(questionId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: onlineExams.courseId })
      .from(examQuestions)
      .innerJoin(onlineExams, eq(onlineExams.id, examQuestions.examId))
      .where(eq(examQuestions.id, questionId))
      .limit(1);
    return row?.courseId ?? null;
  }

  /**
   * Whether the talebe got the question in an attempt of their own: a
   * çalışma seti's or the course pool's attempt that drew it, or their
   * sitting of the exam.
   */
  async gotQuestion(userId: string, q: INoteQuestion): Promise<boolean> {
    if (q.kind === ExamKind.PRACTICE) {
      const [row] = await this.db
        .select({ id: practiceAttempts.id })
        .from(practiceAttempts)
        .where(
          and(
            eq(practiceAttempts.userId, userId),
            eq(practiceAttempts.courseId, q.courseId),
            sql`jsonb_exists(${practiceAttempts.questionOrder}, ${q.questionId})`
          )
        )
        .limit(1);
      return row !== undefined;
    }
    const [row] = await this.db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.examId, q.examId),
          eq(examAttempts.userId, userId),
          sql`jsonb_exists(${examAttempts.questionOrder}, ${q.questionId})`
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /** Whether any talebe's sitting of the exam still runs: not finished, with time left. */
  async anyInProgress(
    examId: string,
    durationMinutes: number
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ id: examAttempts.id })
      .from(examAttempts)
      .where(
        and(
          eq(examAttempts.examId, examId),
          isNull(examAttempts.finishedAt),
          lt(examAttempts.usedSeconds, durationMinutes * 60)
        )
      )
      .limit(1);
    return row !== undefined;
  }

  /** When the celse's results were opened to the talebe; null until then. */
  async releasedAt(lessonId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: lessonExams.resultsReleasedAt })
      .from(lessonExams)
      .where(eq(lessonExams.lessonId, lessonId))
      .limit(1);
    return row?.at ?? null;
  }

  /** The talebe's note on the question, or null. */
  async findMine(
    userId: string,
    questionId: string
  ): Promise<IQuestionNote | null> {
    const [row] = await this.db
      .select()
      .from(questionNotes)
      .where(
        and(
          eq(questionNotes.userId, userId),
          eq(questionNotes.questionId, questionId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** The talebe's notes on the given questions, by question. */
  async mineByQuestion(
    userId: string,
    questionIds: readonly string[]
  ): Promise<Map<string, IQuestionNote>> {
    if (questionIds.length === 0) return new Map();
    const rows = await this.db
      .select()
      .from(questionNotes)
      .where(
        and(
          eq(questionNotes.userId, userId),
          inArray(questionNotes.questionId, [...questionIds])
        )
      );
    return new Map(rows.map((r) => [r.questionId, r]));
  }

  /**
   * Writes the talebe's note on the question whole, under the row's lock
   * when there is one. Sending it (false to true) stamps `shared_at`;
   * taking it back clears it. The hoca's answer stays through both and
   * through a new text. `shared` says whether this write sent it.
   */
  async save(input: {
    userId: string;
    question: INoteQuestion;
    body: string;
    sharedWithTeacher: boolean;
  }): Promise<{ note: IQuestionNote; shared: boolean }> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [held] = await tx
        .select()
        .from(questionNotes)
        .where(
          and(
            eq(questionNotes.userId, input.userId),
            eq(questionNotes.questionId, input.question.questionId)
          )
        )
        .for("update");
      const sharedAt = input.sharedWithTeacher
        ? held?.sharedWithTeacher
          ? held.sharedAt
          : now
        : null;
      if (held) {
        const [note] = await tx
          .update(questionNotes)
          .set({
            body: input.body,
            sharedWithTeacher: input.sharedWithTeacher,
            sharedAt,
            updatedAt: now,
          })
          .where(eq(questionNotes.id, held.id))
          .returning();
        return {
          note,
          shared: input.sharedWithTeacher && !held.sharedWithTeacher,
        };
      }
      // Two first writes at once: the unique key lets one in, and the
      // other writes over it as a second write would.
      const [{ inserted, ...note }] = await tx
        .insert(questionNotes)
        .values({
          courseId: input.question.courseId,
          examId: input.question.examId,
          questionId: input.question.questionId,
          userId: input.userId,
          body: input.body,
          sharedWithTeacher: input.sharedWithTeacher,
          sharedAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [questionNotes.userId, questionNotes.questionId],
          set: {
            body: input.body,
            sharedWithTeacher: input.sharedWithTeacher,
            sharedAt: input.sharedWithTeacher
              ? sql`coalesce(${questionNotes.sharedAt}, ${now.toISOString()}::timestamptz)`
              : null,
            updatedAt: now,
          },
        })
        .returning({
          ...getTableColumns(questionNotes),
          // false when the other first write won and this one wrote over it:
          // that one sent the notification, if any.
          inserted: sql<boolean>`(xmax = 0)`,
        });
      return { note, shared: input.sharedWithTeacher && inserted };
    });
  }

  /** Deletes the talebe's note on the question; false when there was none. */
  async removeMine(userId: string, questionId: string): Promise<boolean> {
    const gone = await this.db
      .delete(questionNotes)
      .where(
        and(
          eq(questionNotes.userId, userId),
          eq(questionNotes.questionId, questionId)
        )
      )
      .returning({ id: questionNotes.id });
    return gone.length > 0;
  }

  /** The talebe's notes in the course, the latest written first, each with its question and set. */
  async listMine(userId: string, courseId: string): Promise<IMyNoteRow[]> {
    const rows = await this.db
      .select({
        note: questionNotes,
        questionText: examQuestions.text,
        examKind: onlineExams.kind,
        setTitle: onlineExams.title,
        lessonId: onlineExams.lessonId,
      })
      .from(questionNotes)
      .innerJoin(examQuestions, eq(examQuestions.id, questionNotes.questionId))
      .innerJoin(onlineExams, eq(onlineExams.id, questionNotes.examId))
      .where(
        and(
          eq(questionNotes.userId, userId),
          eq(questionNotes.courseId, courseId)
        )
      )
      .orderBy(sql`${questionNotes.updatedAt} desc`, sql`${questionNotes.id}`);
    return rows.map((r) => ({
      ...r.note,
      questionText: r.questionText,
      examKind: r.examKind,
      setTitle: r.setTitle,
      lessonId: r.lessonId,
    }));
  }

  /** Marks every answer on the talebe's notes in the course read. */
  async markRepliesSeen(
    userId: string,
    courseId: string,
    at: Date
  ): Promise<void> {
    await this.db
      .update(questionNotes)
      .set({ replySeenAt: at })
      .where(
        and(
          eq(questionNotes.userId, userId),
          eq(questionNotes.courseId, courseId),
          isNotNull(questionNotes.repliedAt),
          sql`(${questionNotes.replySeenAt} is null or ${questionNotes.replySeenAt} < ${questionNotes.repliedAt})`
        )
      );
  }

  /** The set's notes sent to the hoca, with each question's number and each talebe's name. */
  async listShared(examId: string): Promise<ITeacherNoteRow[]> {
    const rows = await this.db
      .select({
        note: questionNotes,
        questionText: examQuestions.text,
        questionNumber: sql<number>`(select count(*) from ${examQuestions} q2 where q2.exam_id = ${examQuestions.examId} and q2.position <= ${examQuestions.position})::int`,
        givenName: users.givenName,
        familyName: users.familyName,
        email: users.email,
      })
      .from(questionNotes)
      .innerJoin(examQuestions, eq(examQuestions.id, questionNotes.questionId))
      .leftJoin(users, eq(users.id, questionNotes.userId))
      .where(
        and(
          eq(questionNotes.examId, examId),
          eq(questionNotes.sharedWithTeacher, true)
        )
      );
    return rows.map((r) => ({
      ...r.note,
      questionText: r.questionText,
      questionNumber: Number(r.questionNumber),
      talebeName: displayNameOf({
        givenName: r.givenName,
        familyName: r.familyName,
        email: r.email,
      }),
    }));
  }

  /** How many notes sent to the hoca wait for an answer, per set. */
  async unansweredCounts(
    examIds: readonly string[]
  ): Promise<Map<string, number>> {
    if (examIds.length === 0) return new Map();
    const rows = await this.db
      .select({ examId: questionNotes.examId, n: count() })
      .from(questionNotes)
      .where(
        and(
          inArray(questionNotes.examId, [...examIds]),
          eq(questionNotes.sharedWithTeacher, true),
          isNull(questionNotes.teacherReply)
        )
      )
      .groupBy(questionNotes.examId);
    return new Map(rows.map((r) => [r.examId, Number(r.n)]));
  }

  /** The course of a note sent to the hoca; null for one kept to its talebe or not there. */
  async findSharedCourse(noteId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ courseId: questionNotes.courseId })
      .from(questionNotes)
      .where(
        and(
          eq(questionNotes.id, noteId),
          eq(questionNotes.sharedWithTeacher, true)
        )
      )
      .limit(1);
    return row?.courseId ?? null;
  }

  /**
   * Sets the hoca's answer on a note sent to them, or takes it back (null),
   * with its `question_note.reply` audit row, in one transaction under the
   * note's lock. Null when the note is not there or no longer sent; `first`
   * says whether the note had no answer before.
   */
  async reply(
    noteId: string,
    actorId: string,
    reply: string | null
  ): Promise<{ note: IQuestionNote; first: boolean } | null> {
    return this.db.transaction(async (tx: Tx) => {
      const [held] = await tx
        .select()
        .from(questionNotes)
        .where(
          and(
            eq(questionNotes.id, noteId),
            eq(questionNotes.sharedWithTeacher, true)
          )
        )
        .for("update");
      if (!held) return null;
      const now = new Date();
      const [note] = await tx
        .update(questionNotes)
        .set(
          reply === null
            ? { teacherReply: null, repliedBy: null, repliedAt: null }
            : { teacherReply: reply, repliedBy: actorId, repliedAt: now }
        )
        .where(eq(questionNotes.id, noteId))
        .returning();
      await tx.insert(auditLog).values({
        actorId,
        action: "question_note.reply",
        entity: "question_note",
        entityId: noteId,
        details: {
          courseId: held.courseId,
          examId: held.examId,
          questionId: held.questionId,
          removed: reply === null,
        },
      });
      return { note, first: held.teacherReply === null && reply !== null };
    });
  }
}
