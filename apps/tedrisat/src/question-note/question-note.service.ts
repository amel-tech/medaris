import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { CourseNotifier } from "../course/course-notifier";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { OnlineExamNotFoundError } from "../online-exam/errors/online-exam.errors";
import {
  editedAfterReply,
  type IMyQuestionNote,
  presentMine,
  shareOpen,
  teacherOrder,
} from "./domain/question-note";
import type {
  ExamQuestionNoteResponse,
  MyQuestionNoteListItemResponse,
} from "./dto/question-note.dto";
import {
  NoteQuestionNotFoundError,
  NotesDisabledError,
  NotesShareLockedError,
  QuestionNoteNotFoundError,
  QuestionNotesForbiddenError,
} from "./errors/question-note.errors";
import {
  type INoteQuestion,
  QuestionNoteRepository,
} from "./question-note.repository";

/**
 * Soru notları (MDRS-248): a talebe's note on a question of a çalışma seti
 * or an online exam they solved or sat, their own until they send it to the
 * course's hoca, who reads it on the set and may answer it.
 *
 * A note is written on a question the team left notes on for
 * (`exam_questions.talebe_notes`; NOTES_DISABLED otherwise) by a talebe who
 * may write on the course (`mayWriteAsTalebe`, as a practice attempt asks)
 * and got the question in an attempt of their own. What was written stays
 * readable when the team turns the notes off. An exam's note goes to the
 * hoca only once the exam is over for everyone or its results are open
 * (NOTES_SHARE_LOCKED), so that it is never a channel while talebe sit it.
 *
 * A notification that cannot be written is logged by the notifier and the
 * note stands.
 */
@Injectable()
export class QuestionNoteService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: QuestionNoteRepository,
    private readonly courses: CourseService,
    private readonly notifier: CourseNotifier
  ) {}

  /** Whether `getDetail` shows the course to the caller. */
  private async isVisible(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    try {
      await this.courses.getDetail(courseId, user, { read: true });
      return true;
    } catch (error) {
      if (error instanceof CourseNotFoundError) return false;
      throw error;
    }
  }

  /**
   * The question, for a caller who got it in an attempt of their own in a
   * course they still see; NOTE_QUESTION_NOT_FOUND otherwise, as for one
   * that is not there.
   */
  private async questionFor(
    user: AuthenticatedUser,
    questionId: string
  ): Promise<INoteQuestion> {
    const q = await this.repo.findQuestion(questionId);
    if (
      !q ||
      !(await this.isVisible(user, q.courseId)) ||
      !(await this.repo.gotQuestion(user.sub, q))
    ) {
      throw new NoteQuestionNotFoundError(questionId);
    }
    return q;
  }

  /** Whether a note on the question may be sent to the hoca now. */
  private async mayShare(q: INoteQuestion, now: Date): Promise<boolean> {
    const [anyInProgress, releasedAt] = await Promise.all([
      q.durationMinutes === null
        ? Promise.resolve(false)
        : this.repo.anyInProgress(q.examId, q.durationMinutes),
      q.lessonId === null
        ? Promise.resolve(null)
        : this.repo.releasedAt(q.lessonId),
    ]);
    return shareOpen({
      kind: q.kind,
      now,
      startsAt: q.startsAt,
      latestStartAt: q.latestStartAt,
      closedEarlyAt: q.closedEarlyAt,
      anyInProgress,
      releasedAt,
    });
  }

  /**
   * Writes the caller's note on the question whole: a new one, or the one
   * they have. Sending it to the hoca tells the course's müderris; an answer
   * the hoca gave stays through a new text, which the hoca then reads as
   * changed since.
   */
  async saveMine(
    user: AuthenticatedUser,
    questionId: string,
    input: { body: string; sharedWithTeacher: boolean }
  ): Promise<IMyQuestionNote> {
    const q = await this.questionFor(user, questionId);
    if (!(await this.courses.mayWriteAsTalebe(user, q.courseId))) {
      throw new QuestionNotesForbiddenError(q.courseId);
    }
    if (!q.talebeNotes) throw new NotesDisabledError(questionId);
    if (input.sharedWithTeacher) {
      const mine = await this.repo.findMine(user.sub, questionId);
      // A note already sent stays sent; one being sent waits for its exam.
      if (!mine?.sharedWithTeacher && !(await this.mayShare(q, new Date()))) {
        throw new NotesShareLockedError(questionId);
      }
    }
    const { note, shared } = await this.repo.save({
      userId: user.sub,
      question: q,
      body: input.body,
      sharedWithTeacher: input.sharedWithTeacher,
    });
    if (shared) {
      await this.notifier.questionNoteShared(
        {
          courseId: q.courseId,
          examId: q.examId,
          setTitle: q.examTitle,
          kind: q.kind,
        },
        user.sub
      );
    }
    return presentMine(note);
  }

  /** Deletes the caller's note on the question, the hoca's answer with it. */
  async removeMine(user: AuthenticatedUser, questionId: string): Promise<void> {
    const q = await this.questionFor(user, questionId);
    if (!(await this.courses.mayReachOwnWriting(user, q.courseId))) {
      throw new QuestionNotesForbiddenError(q.courseId);
    }
    if (!(await this.repo.removeMine(user.sub, questionId))) {
      throw new QuestionNoteNotFoundError(questionId);
    }
  }

  /**
   * The caller's notes in the course, the latest written first, each with
   * its question and its set; reading them marks the hoca's answers read.
   */
  async listMine(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<MyQuestionNoteListItemResponse[]> {
    await this.courses.getDetail(courseId, user, { read: true });
    if (!(await this.courses.mayReachOwnWriting(user, courseId))) {
      throw new QuestionNotesForbiddenError(courseId);
    }
    const rows = await this.repo.listMine(user.sub, courseId);
    await this.repo.markRepliesSeen(user.sub, courseId, new Date());
    return rows.map((r) => ({
      ...presentMine(r),
      questionId: r.questionId,
      questionText: r.questionText,
      examId: r.examId,
      examKind: r.examKind,
      setTitle: r.setTitle,
      lessonId: r.lessonId,
      createdAt: r.createdAt,
    }));
  }

  /**
   * The set's notes sent to the hoca, the unanswered first. The route has
   * asked `exam.prepare` on the set's course; the course must be one the
   * caller sees.
   */
  async listForExam(
    user: AuthenticatedUser,
    examId: string
  ): Promise<ExamQuestionNoteResponse[]> {
    const courseId = await this.repo.findExamCourse(examId);
    if (!courseId) throw new OnlineExamNotFoundError(examId);
    await this.courses.getDetail(courseId, user);
    const rows = await this.repo.listShared(examId);
    return rows.sort(teacherOrder).map((r) => this.forTeacher(r));
  }

  /**
   * The hoca's answer on a note sent to them, replacing an earlier one; an
   * empty answer takes it back. The route has asked `exam.prepare` on the
   * note's course. The first answer tells the talebe.
   */
  async reply(
    user: AuthenticatedUser,
    noteId: string,
    reply: string
  ): Promise<ExamQuestionNoteResponse> {
    const courseId = await this.repo.findSharedCourse(noteId);
    if (!courseId || !(await this.isVisible(user, courseId))) {
      throw new QuestionNoteNotFoundError(noteId);
    }
    const done = await this.repo.reply(
      noteId,
      user.sub,
      reply === "" ? null : reply
    );
    if (!done) throw new QuestionNoteNotFoundError(noteId);
    // Told first: the answer is saved whatever happens to the note next.
    if (done.first) {
      const q = await this.repo.findQuestion(done.note.questionId);
      if (q) {
        await this.notifier.questionNoteReplied(
          {
            courseId: q.courseId,
            examId: q.examId,
            setTitle: q.examTitle,
            kind: q.kind,
            talebeId: done.note.userId,
          },
          user.sub
        );
      }
    }
    const [row] = (await this.repo.listShared(done.note.examId)).filter(
      (r) => r.id === noteId
    );
    // Taken back by its talebe since: the answer stands, the note is no
    // longer the hoca's to read.
    if (!row) throw new QuestionNoteNotFoundError(noteId);
    return this.forTeacher(row);
  }

  private forTeacher(
    r: Awaited<ReturnType<QuestionNoteRepository["listShared"]>>[number]
  ): ExamQuestionNoteResponse {
    return {
      id: r.id,
      questionId: r.questionId,
      questionNumber: r.questionNumber,
      questionText: r.questionText,
      talebe: { id: r.userId, name: r.talebeName },
      body: r.body,
      sharedAt: r.sharedAt ?? r.updatedAt,
      updatedAt: r.updatedAt,
      editedAfterReply: editedAfterReply(r),
      teacherReply: r.teacherReply,
      repliedAt: r.repliedAt,
      repliedBy: r.repliedBy,
    };
  }
}
