import { type AuthenticatedUser, ValidationError } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { ExamFormat } from "../course/domain/exam";
import {
  AnswerMode,
  examStatus,
  LATEST_START_DEFAULT_MINUTES,
  lacksOf,
  modeFits,
  type PublishProblem,
  pointsFit,
  pointsFromText,
  pointsText,
  publishProblems,
  publishTimeProblem,
  type Scoring,
  sharePoints,
  shareText,
  TOPIC_WORDS_MAX,
  toMinute,
  topicWordCount,
} from "./domain/online-exam";
import type {
  CourseTopicResponse,
  ExamPointsResponse,
  ExamQuestionResponse,
  ExamQuestionWriteResponse,
  ExamVersionResponse,
  OnlineExamDraftResponse,
  OnlineExamSummaryResponse,
} from "./dto/online-exam.dto";
import {
  ExamLockedError,
  ExamNotPublishedError,
  ExamNotReadyError,
  ExamStaleError,
  ExamTimePassedError,
  OnlineExamNotFoundError,
  PointsOverTotalError,
  QuestionModeInvalidError,
  TopicTooLongError,
} from "./errors/online-exam.errors";
import {
  type IExamWrite,
  type IOnlineExamDraft,
  OnlineExamRepository,
} from "./online-exam.repository";
import { ZerothQuestionRepository } from "./zeroth-question.repository";

/** An online exam's celse is out of 100, as the results are (MDRS-299). */
const ONLINE_EXAM_MAX_SCORE = 100;
/** The largest Postgres `integer`, the bound of a celse's length in minutes. */
const CELSE_MINUTES_MAX = 2_147_483_647;

/**
 * Preparing a course's online multiple-choice exams (MDRS-299): the course's
 * numbered topics, each exam's draft, its questions with their options and
 * topics, and their points. A draft has no celse and no talebe sees it; the
 * routes ask `exam.prepare` on the course.
 *
 * Every write names the version the page holds and answers the new one, so
 * two people preparing one exam never overwrite each other unseen.
 */
@Injectable()
export class OnlineExamService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: OnlineExamRepository,
    private readonly courses: CourseService,
    private readonly zeroth: ZerothQuestionRepository
  ) {}

  /** The course as the caller may write to it: a hidden or draft course they may not see is not found. */
  private async course(courseId: string, user: AuthenticatedUser) {
    await this.courses.getDetail(courseId, user);
    return courseId;
  }

  async listExams(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<OnlineExamSummaryResponse[]> {
    await this.course(courseId, user);
    const exams = await this.repo.listExams(courseId);
    const now = new Date();
    return exams.map((e) => ({
      id: e.id,
      title: e.title,
      questionCount: Number(e.questionCount),
      status: examStatus(e, now),
      startsAt: e.startsAt,
      updatedAt: e.updatedAt,
    }));
  }

  async createExam(
    courseId: string,
    title: string,
    user: AuthenticatedUser
  ): Promise<{ id: string }> {
    await this.course(courseId, user);
    return { id: await this.repo.createExam(courseId, title, user.sub) };
  }

  async getDraft(
    examId: string,
    user: AuthenticatedUser
  ): Promise<OnlineExamDraftResponse> {
    const courseId = await this.courseOf(examId, user);
    const [draft, topics, hasZeroth] = await Promise.all([
      this.repo.findDraft(courseId, examId),
      this.repo.listTopics(courseId),
      this.zerothOfCourse(courseId).then((q) => q !== null),
    ]);
    if (!draft) throw new OnlineExamNotFoundError(examId);
    const shares = sharePoints(
      draft.questions.map((q) => ({ id: q.id, ownHundredths: q.ownPoints }))
    );
    const carried = new Map<string, number>();
    for (const q of draft.questions) {
      for (const t of q.topicIds) carried.set(t, (carried.get(t) ?? 0) + 1);
    }
    const picked = new Set(draft.topicIds);
    const pointsTotal = this.totalOf(shares);
    return {
      id: draft.id,
      courseId: draft.courseId,
      title: draft.title,
      durationMinutes: draft.durationMinutes,
      instructions: draft.instructions,
      zerothQuestion: draft.zerothQuestion,
      zerothOptions: draft.zerothOptions,
      courseTopics: topics.map((t) => ({
        ...t,
        picked: picked.has(t.id),
        questionCount: carried.get(t.id) ?? 0,
      })),
      topicIds: draft.topicIds,
      questions: draft.questions.map((q, i) =>
        this.questionOf(q, i, shares.points.get(q.id))
      ),
      pointsTotal,
      status: examStatus(draft, new Date()),
      startsAt: draft.startsAt,
      latestStartAt: draft.latestStartAt,
      problems: draft.publishedAt
        ? []
        : this.problemsOf(draft, pointsTotal, hasZeroth),
      version: draft.version,
    };
  }

  /**
   * "Yayınla": the exam opens at `startsAt` (now when it is left out), and a
   * talebe may start it until `latestStartAt` (the start plus ten minutes
   * when it is left out). Its celse is planned at that start, as long as the
   * exam and the latest start together, with its exam row (MULTIPLE_CHOICE,
   * out of 100), and the exam is linked to it, all in one transaction: an
   * exam that is not ready, or that changed since the page read it, plans
   * nothing.
   */
  async publish(
    examId: string,
    input: { version: number; startsAt?: Date; latestStartAt?: Date },
    user: AuthenticatedUser
  ): Promise<OnlineExamDraftResponse> {
    const w = await this.writeOf(examId, input.version, user);
    const now = new Date();
    const startsAt = toMinute(input.startsAt ?? now);
    const latestStartAt = toMinute(
      input.latestStartAt ??
        new Date(startsAt.getTime() + LATEST_START_DEFAULT_MINUTES * 60_000)
    );
    const timing = publishTimeProblem(startsAt, latestStartAt, now);
    if (timing) throw new ExamTimePassedError(timing);
    const draft = await this.repo.findDraft(w.courseId, examId);
    if (!draft) throw new OnlineExamNotFoundError(examId);
    if (draft.publishedAt) throw new ExamLockedError(examId);
    // The write below checks the version again under the row's lock; the
    // same version means what is checked here is what is published.
    if (draft.version !== input.version) {
      throw new ExamStaleError(examId, input.version);
    }
    const shares = sharePoints(
      draft.questions.map((q) => ({ id: q.id, ownHundredths: q.ownPoints }))
    );
    const madrasahId = await this.repo.findCourseMadrasahId(w.courseId);
    const asked = madrasahId
      ? await this.zeroth.findForMadrasah(madrasahId)
      : null;
    const problems = this.problemsOf(
      draft,
      this.totalOf(shares),
      asked !== null
    );
    if (problems.length > 0) throw new ExamNotReadyError(examId, problems);
    const spread = Math.round(
      (latestStartAt.getTime() - startsAt.getTime()) / 60_000
    );
    await this.courses.createExamSession(
      w.courseId,
      {
        title: draft.title,
        // Kept within the column: the length has no bound of its own.
        durationMinutes: Math.min(
          draft.durationMinutes + spread,
          CELSE_MINUTES_MAX
        ),
        scheduledAt: startsAt,
        exam: {
          format: ExamFormat.MULTIPLE_CHOICE,
          maxScore: ONLINE_EXAM_MAX_SCORE,
        },
        within: async (tx, [lessonId]) => {
          // Read again in the transaction: the question copied is the one
          // the medrese asks as the exam is published.
          const zeroth = madrasahId
            ? await this.zeroth.findForMadrasah(madrasahId, tx)
            : null;
          if (!zeroth) {
            throw new ExamNotReadyError(examId, [{ kind: "NO_ZEROTH" }]);
          }
          await this.repo.write(
            w,
            {
              action: "online_exam.publish",
              details: {
                lessonId,
                startsAt: startsAt.toISOString(),
                latestStartAt: latestStartAt.toISOString(),
              },
            },
            (t) =>
              this.repo.publish(t, examId, {
                lessonId,
                latestStartAt,
                zeroth: { text: zeroth.text, options: zeroth.options },
              }),
            { tx }
          );
        },
      },
      user.sub
    );
    return this.getDraft(examId, user);
  }

  /**
   * "Taslağa al", until the exam opens: its celse is deleted and it is a
   * draft again, with everything it had. Once it has opened it is
   * EXAM_LOCKED.
   */
  async unpublish(
    examId: string,
    version: number,
    user: AuthenticatedUser
  ): Promise<OnlineExamDraftResponse> {
    const w = await this.writeOf(examId, version, user);
    const draft = await this.repo.findDraft(w.courseId, examId);
    if (!draft) throw new OnlineExamNotFoundError(examId);
    if (!draft.publishedAt || !draft.lessonId) {
      throw new ExamNotPublishedError(examId);
    }
    const lessonId = draft.lessonId;
    await this.courses.withdrawExamSession(lessonId, user.sub, async (tx) => {
      await this.repo.write(
        w,
        { action: "online_exam.unpublish", details: { lessonId } },
        (t) => this.repo.unpublish(t, examId),
        { of: "published", tx }
      );
    });
    return this.getDraft(examId, user);
  }

  /** What keeps the draft from being published; empty when it can be. */
  private problemsOf(
    draft: IOnlineExamDraft,
    pointsTotal: string,
    hasZeroth: boolean
  ): PublishProblem[] {
    return publishProblems({
      questions: draft.questions,
      pointsTotal,
      hasZeroth,
    });
  }

  /** The zeroth question of the course's medrese; null for a köşk's own course, or a medrese with none. */
  private async zerothOfCourse(courseId: string) {
    const madrasahId = await this.repo.findCourseMadrasahId(courseId);
    return madrasahId ? this.zeroth.findForMadrasah(madrasahId) : null;
  }

  async updateExam(
    examId: string,
    input: {
      version: number;
      title?: string;
      durationMinutes?: number;
      instructions?: string | null;
      topicIds?: string[];
    },
    user: AuthenticatedUser
  ): Promise<ExamVersionResponse> {
    const w = await this.writeOf(examId, input.version, user);
    const { version: _, ...changes } = input;
    const { version } = await this.repo.write(
      w,
      {
        action: "online_exam.update",
        details: { changed: Object.keys(changes) },
      },
      (tx) => this.repo.updateExam(tx, w, changes)
    );
    return { version };
  }

  async addQuestion(
    examId: string,
    expected: number,
    user: AuthenticatedUser
  ): Promise<ExamQuestionWriteResponse> {
    const w = await this.writeOf(examId, expected, user);
    const { result: questionId, version } = await this.repo.write(
      w,
      { action: "exam_question.add" },
      (tx) => this.repo.addQuestion(tx, examId)
    );
    return { question: await this.questionNow(w, questionId), version };
  }

  async saveQuestion(
    examId: string,
    questionId: string,
    input: {
      version: number;
      text: string;
      options: Array<{ text: string; correct: boolean }>;
      answerMode: AnswerMode;
      scoring?: Scoring | null;
      topicIds: string[];
    },
    user: AuthenticatedUser
  ): Promise<ExamQuestionWriteResponse> {
    const scoring =
      input.answerMode === AnswerMode.MULTIPLE ? (input.scoring ?? null) : null;
    const correct = input.options.filter((o) => o.correct).length;
    if (!modeFits(input.answerMode, scoring, correct)) {
      throw new QuestionModeInvalidError(correct);
    }
    const w = await this.writeOf(examId, input.version, user);
    const { version } = await this.repo.write(
      w,
      {
        action: "exam_question.save",
        entityId: questionId,
        details: {
          options: input.options.length,
          correct,
          answerMode: input.answerMode,
          topics: input.topicIds.length,
        },
      },
      async (tx) => {
        await this.repo.lockQuestion(tx, examId, questionId);
        await this.repo.saveQuestion(tx, w, questionId, {
          text: input.text,
          options: input.options,
          answerMode: input.answerMode,
          scoring,
          topicIds: input.topicIds,
        });
      }
    );
    return { question: await this.questionNow(w, questionId), version };
  }

  async removeQuestion(
    examId: string,
    questionId: string,
    expected: number,
    user: AuthenticatedUser
  ): Promise<ExamVersionResponse> {
    const w = await this.writeOf(examId, expected, user);
    const { version } = await this.repo.write(
      w,
      { action: "exam_question.remove", entityId: questionId },
      async (tx) => {
        await this.repo.lockQuestion(tx, examId, questionId);
        await this.repo.removeQuestion(tx, questionId);
      }
    );
    return { version };
  }

  async setPoints(
    examId: string,
    questionId: string,
    input: { version: number; points: string | null },
    user: AuthenticatedUser
  ): Promise<ExamPointsResponse> {
    const own = input.points === null ? null : pointsFromText(input.points);
    if (input.points !== null && own === null) {
      // The DTO holds the shape; 0, 0,00 and anything above 100 come here.
      throw new ValidationError("Points are from 0.01 to 100", {
        errors: [{ property: "points", constraints: { range: "0.01..100" } }],
      });
    }
    const w = await this.writeOf(examId, input.version, user);
    const { result, version } = await this.repo.write(
      w,
      {
        action: "exam_question.points",
        entityId: questionId,
        details: { points: own === null ? null : pointsText(own) },
      },
      async (tx) => {
        await this.repo.lockQuestion(tx, examId, questionId);
        const before = await this.repo.ownPointsOf(tx, examId);
        const after = before.map((q) =>
          q.id === questionId ? { ...q, ownHundredths: own } : q
        );
        const fit = pointsFit(after);
        if (!fit.fits) {
          const others = before.filter((q) => q.id !== questionId);
          const left = pointsFit(others).left;
          throw new PointsOverTotalError(pointsText(Math.max(left, 0)));
        }
        await this.repo.setOwnPoints(tx, questionId, own);
        return sharePoints(after);
      }
    );
    return {
      questions: [...result.points.entries()].map(([id, p]) => ({
        questionId: id,
        points: shareText(p),
        own: p.own,
      })),
      total: this.totalOf(result),
      version,
    };
  }

  async listTopics(
    courseId: string,
    user: AuthenticatedUser
  ): Promise<CourseTopicResponse[]> {
    await this.course(courseId, user);
    return this.repo.listTopics(courseId);
  }

  async createTopic(
    courseId: string,
    input: { name: string; number?: number },
    user: AuthenticatedUser
  ): Promise<CourseTopicResponse> {
    this.assertTopicName(input.name);
    await this.course(courseId, user);
    return this.repo.createTopic(courseId, input, user.sub);
  }

  async updateTopic(
    courseId: string,
    topicId: string,
    input: { name?: string; number?: number },
    user: AuthenticatedUser
  ): Promise<CourseTopicResponse> {
    if (input.name !== undefined) this.assertTopicName(input.name);
    await this.course(courseId, user);
    return this.repo.updateTopic(courseId, topicId, input, user.sub);
  }

  /** The exams whose pick it took off, each with its new version. */
  async removeTopic(
    courseId: string,
    topicId: string,
    user: AuthenticatedUser
  ): Promise<{ exams: Array<{ id: string; version: number }> }> {
    await this.course(courseId, user);
    return { exams: await this.repo.removeTopic(courseId, topicId, user.sub) };
  }

  private assertTopicName(name: string): void {
    const words = topicWordCount(name);
    if (words > TOPIC_WORDS_MAX) throw new TopicTooLongError(words);
  }

  private async courseOf(
    examId: string,
    user: AuthenticatedUser
  ): Promise<string> {
    const courseId = await this.repo.findExamCourseId(examId);
    if (!courseId) throw new OnlineExamNotFoundError(examId);
    return this.course(courseId, user);
  }

  private async writeOf(
    examId: string,
    version: number,
    user: AuthenticatedUser
  ): Promise<IExamWrite> {
    return {
      courseId: await this.courseOf(examId, user),
      examId,
      version,
      actorId: user.sub,
    };
  }

  /** A question as it stands after its write, with its points among the exam's. */
  private async questionNow(
    w: IExamWrite,
    questionId: string
  ): Promise<ExamQuestionResponse> {
    const draft = await this.repo.findDraft(w.courseId, w.examId);
    if (!draft) throw new OnlineExamNotFoundError(w.examId);
    const shares = sharePoints(
      draft.questions.map((q) => ({ id: q.id, ownHundredths: q.ownPoints }))
    );
    const index = draft.questions.findIndex((q) => q.id === questionId);
    return this.questionOf(
      draft.questions[index],
      index,
      shares.points.get(questionId)
    );
  }

  private questionOf(
    q: IOnlineExamDraft["questions"][number],
    index: number,
    share: { numerator: number; denominator: number } | undefined
  ): ExamQuestionResponse {
    const lacks = lacksOf(q);
    return {
      id: q.id,
      number: index + 1,
      text: q.text,
      options: q.options,
      answerMode: q.answerMode,
      scoring: q.scoring,
      topicIds: q.topicIds,
      ownPoints: q.ownPoints === null ? null : pointsText(q.ownPoints),
      points: share ? shareText(share) : pointsText(0),
      complete: lacks.length === 0,
      lacks,
    };
  }

  /** The points of every question together, from the exact shares. */
  private totalOf(shares: ReturnType<typeof sharePoints>): string {
    if (shares.points.size === 0) return pointsText(0);
    const own = [...shares.points.values()]
      .filter((p) => p.own)
      .reduce((sum, p) => sum + p.numerator, 0);
    return pointsText(
      own + (shares.sharing > 0 ? Math.max(shares.left, 0) : 0)
    );
  }
}
