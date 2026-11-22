import { randomInt } from "node:crypto";
import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "../course/course.repository";
import { CourseService } from "../course/course.service";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import {
  AttemptStatus,
  answerFits,
  CLOCK_CREDIT_MAX_SECONDS,
  creditedSeconds,
  drawOrder,
  ExamWindow,
  examWindow,
  FinishedBy,
  latestStartOf,
  scoreHundredths,
  secondsLeft,
} from "./domain/exam-attempt";
import { sharePoints, shareText } from "./domain/online-exam";
import type {
  ExamAnswerSavedResponse,
  ExamAttemptResponse,
  ExamBriefingResponse,
  ExamClockResponse,
  SaveExamAnswerDto,
  ZerothAnswerResponse,
} from "./dto/exam-attempt.dto";
import {
  AnswerInvalidError,
  AttemptEndedError,
  AttemptHeldElsewhereError,
  AttemptNotFoundError,
  AttemptQuestionNotFoundError,
  ExamAlreadyTakenError,
  ExamNotOpenError,
  ZerothAnswerLockedError,
  ZerothOptionNotFoundError,
  ZerothUnansweredError,
} from "./errors/exam-attempt.errors";
import { OnlineExamNotFoundError } from "./errors/online-exam.errors";
import {
  ExamAttemptRepository,
  type IAttempt,
  type IPublishedExam,
  type Tx,
} from "./exam-attempt.repository";
import {
  type IDraftQuestion,
  OnlineExamRepository,
} from "./online-exam.repository";

/** A random number in [0, 1) from the system's cryptographic source. */
const fairRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** What a write on an attempt came to; a refusal is thrown once the transaction has committed what it settled. */
type Outcome<T> =
  | { ok: T }
  | { refused: "ended" | "elsewhere" | "question" | "answer" };

/**
 * A talebe's sitting of a published online exam (MDRS-299), in tedris: the
 * briefing with the zeroth question, the start in an order of their own,
 * every answer saved as it is chosen, the server's clock, switches to
 * another tab counted, and the finish with its score.
 *
 * Only an ENROLLED talebe of the course who may write on it reaches the exam;
 * to anyone else, a draft and a celse that is not an online exam, there is
 * no such exam (EXAM_NOT_FOUND). An attempt whose time has run out, or whose
 * exam the team closed early, is finished on the next read of it, with the
 * answers saved before.
 */
@Injectable()
export class ExamAttemptService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ExamAttemptRepository,
    private readonly exams: OnlineExamRepository,
    private readonly courses: CourseService,
    private readonly courseRepo: CourseRepository
  ) {}

  /** The published exam of the celse, for an ENROLLED talebe who may write on its course. */
  private async examFor(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<IPublishedExam> {
    await this.courses.findVisibleLessonCourse(lessonId, user);
    const exam = await this.repo.findPublishedByLesson(lessonId);
    if (!exam) throw new OnlineExamNotFoundError(lessonId);
    const seat = await this.courseRepo.findEnrollment(user.sub, exam.courseId);
    if (
      seat?.status !== EnrollmentStatus.ENROLLED ||
      !(await this.courses.mayWriteAsTalebe(user, exam.courseId))
    ) {
      throw new OnlineExamNotFoundError(lessonId);
    }
    return exam;
  }

  private async questionsOf(exam: IPublishedExam): Promise<IDraftQuestion[]> {
    const draft = await this.exams.findDraft(exam.courseId, exam.examId);
    return draft?.questions ?? [];
  }

  /**
   * Finishes an attempt in progress whose exam was closed early or whose time
   * is used up, scored from the answers saved; any other is left as it is.
   */
  private async settle(
    tx: Tx,
    exam: IPublishedExam,
    attempt: IAttempt,
    questions: IDraftQuestion[],
    now: Date
  ): Promise<IAttempt> {
    if (attempt.finishedAt !== null) return attempt;
    if (exam.closedEarlyAt !== null && exam.closedEarlyAt <= now) {
      return this.finish(
        tx,
        attempt,
        questions,
        FinishedBy.CLOSED_EARLY,
        exam.closedEarlyAt
      );
    }
    if (secondsLeft(exam.durationMinutes, attempt.usedSeconds) === 0) {
      return this.finish(tx, attempt, questions, FinishedBy.TIME, now);
    }
    return attempt;
  }

  private async finish(
    tx: Tx,
    attempt: IAttempt,
    questions: IDraftQuestion[],
    by: FinishedBy,
    at: Date,
    usedSeconds = attempt.usedSeconds
  ): Promise<IAttempt> {
    const answers = await this.repo.answersOf(attempt.id, tx);
    const score = scoreHundredths(
      questions.map((q) => ({
        id: q.id,
        answerMode: q.answerMode,
        scoring: q.scoring,
        ownHundredths: q.ownPoints,
        options: q.options,
      })),
      new Map(answers.map((a) => [a.questionId, a.optionIds]))
    );
    return this.repo.updateAttempt(tx, attempt.id, {
      finishedAt: at,
      finishedBy: by,
      scoreHundredths: score,
      usedSeconds,
      countedAt: at,
    });
  }

  /** The clock after a call of the holding page: the time since the last count, capped, never past the length. */
  private counted(exam: IPublishedExam, attempt: IAttempt, now: Date): number {
    return Math.min(
      exam.durationMinutes * 60,
      attempt.usedSeconds +
        creditedSeconds(attempt.countedAt, now, CLOCK_CREDIT_MAX_SECONDS)
    );
  }

  private async view(
    exam: IPublishedExam,
    attempt: IAttempt,
    questions: IDraftQuestion[]
  ): Promise<ExamAttemptResponse> {
    const base = {
      status:
        attempt.finishedAt === null
          ? AttemptStatus.IN_PROGRESS
          : AttemptStatus.FINISHED,
      secondsLeft: secondsLeft(exam.durationMinutes, attempt.usedSeconds),
      switches: attempt.switches,
      currentQuestionId: attempt.currentQuestionId,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      finishedBy: attempt.finishedBy,
    };
    if (attempt.finishedAt !== null) {
      return { ...base, secondsLeft: 0, questions: [], answers: [] };
    }
    const { points } = sharePoints(
      questions.map((q) => ({ id: q.id, ownHundredths: q.ownPoints }))
    );
    const byId = new Map(questions.map((q) => [q.id, q]));
    const answers = await this.repo.answersOf(attempt.id);
    return {
      ...base,
      questions: attempt.questionOrder.flatMap((id, i) => {
        const q = byId.get(id);
        if (!q) return [];
        const options = new Map(q.options.map((o) => [o.id, o.text]));
        const p = points.get(id);
        return [
          {
            id,
            number: i + 1,
            text: q.text,
            answerMode: q.answerMode,
            points: p ? shareText(p) : "0.00",
            options: (attempt.optionOrder[id] ?? []).flatMap((optionId) =>
              options.has(optionId)
                ? [{ id: optionId, text: options.get(optionId) as string }]
                : []
            ),
          },
        ];
      }),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        optionIds: a.optionIds,
        skipped: a.skipped,
      })),
    };
  }

  /** "Bilmeniz gerekenler": the exam, its window, the zeroth question and where the caller's attempt stands. */
  async briefing(
    user: AuthenticatedUser,
    lessonId: string
  ): Promise<ExamBriefingResponse> {
    const exam = await this.examFor(user, lessonId);
    const now = new Date();
    const questions = await this.questionsOf(exam);
    const [options, answered] = await Promise.all([
      this.repo.zerothOptionsOf(exam.examId),
      this.repo.findZerothAnswer(exam.examId, user.sub),
    ]);
    const attempt = await this.repo.inAttempt(exam.examId, user.sub, (tx, a) =>
      this.settle(tx, exam, a, questions, now)
    );
    const latest = latestStartOf(exam.startsAt, exam.latestStartAt);
    return {
      lessonId,
      courseId: exam.courseId,
      title: exam.title,
      courseTitle: exam.courseTitle,
      durationMinutes: exam.durationMinutes,
      questionCount: questions.length,
      startsAt: exam.startsAt,
      latestStartAt: latest,
      instructions: exam.instructions,
      window: examWindow(now, exam.startsAt, latest, exam.closedEarlyAt),
      zeroth: {
        question: exam.zerothQuestion,
        options,
        answeredOptionId: answered,
      },
      attempt: attempt
        ? {
            status:
              attempt.finishedAt === null
                ? AttemptStatus.IN_PROGRESS
                : AttemptStatus.FINISHED,
            finishedAt: attempt.finishedAt,
            finishedBy: attempt.finishedBy,
          }
        : null,
    };
  }

  /** Saves the caller's choice for the zeroth question, until the attempt starts. */
  async answerZeroth(
    user: AuthenticatedUser,
    lessonId: string,
    optionId: string
  ): Promise<ZerothAnswerResponse> {
    const exam = await this.examFor(user, lessonId);
    const now = new Date();
    if (await this.repo.findAttempt(exam.examId, user.sub)) {
      throw new ZerothAnswerLockedError(lessonId);
    }
    const latest = latestStartOf(exam.startsAt, exam.latestStartAt);
    if (
      examWindow(now, exam.startsAt, latest, exam.closedEarlyAt) !==
      ExamWindow.OPEN
    ) {
      throw new ExamNotOpenError(lessonId);
    }
    const options = await this.repo.zerothOptionsOf(exam.examId);
    if (!options.some((o) => o.id === optionId)) {
      throw new ZerothOptionNotFoundError(optionId);
    }
    await this.repo.saveZerothAnswer(exam.examId, user.sub, optionId, now);
    return { optionId };
  }

  /**
   * "Sınava başla": the questions and each question's options in an order of
   * the caller's own, and the clock. An attempt in progress is taken over
   * here, as `resume` does; a finished one is refused, an exam is taken once.
   */
  async start(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string
  ): Promise<ExamAttemptResponse> {
    const exam = await this.examFor(user, lessonId);
    const now = new Date();
    const questions = await this.questionsOf(exam);
    if (await this.repo.findAttempt(exam.examId, user.sub)) {
      return this.takeOver(user, lessonId, exam, questions, holderId, true);
    }
    const latest = latestStartOf(exam.startsAt, exam.latestStartAt);
    if (
      examWindow(now, exam.startsAt, latest, exam.closedEarlyAt) !==
      ExamWindow.OPEN
    ) {
      throw new ExamNotOpenError(lessonId);
    }
    const options = await this.repo.zerothOptionsOf(exam.examId);
    if (
      options.length > 0 &&
      (await this.repo.findZerothAnswer(exam.examId, user.sub)) === null
    ) {
      throw new ZerothUnansweredError(lessonId);
    }
    const questionOrder = drawOrder(
      questions.map((q) => q.id),
      fairRandom
    );
    const optionOrder = Object.fromEntries(
      questions.map((q) => [
        q.id,
        drawOrder(
          q.options.map((o) => o.id),
          fairRandom
        ),
      ])
    );
    const made = await this.repo.createAttempt({
      examId: exam.examId,
      userId: user.sub,
      questionOrder,
      optionOrder,
      holderId,
      at: now,
    });
    // Another call started it a moment before: this page takes it over.
    if (
      made.holderId !== holderId ||
      made.startedAt.getTime() !== now.getTime()
    ) {
      return this.takeOver(user, lessonId, exam, questions, holderId, true);
    }
    return this.view(exam, made, questions);
  }

  /**
   * Goes on with the attempt here: the page that calls it holds the attempt
   * from now on, counts its saves from 1 again, and the time the page was
   * away is not counted.
   */
  async resume(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string
  ): Promise<ExamAttemptResponse> {
    const exam = await this.examFor(user, lessonId);
    const questions = await this.questionsOf(exam);
    return this.takeOver(user, lessonId, exam, questions, holderId, false);
  }

  private async takeOver(
    user: AuthenticatedUser,
    lessonId: string,
    exam: IPublishedExam,
    questions: IDraftQuestion[],
    holderId: string,
    starting: boolean
  ): Promise<ExamAttemptResponse> {
    const now = new Date();
    const attempt = await this.repo.inAttempt(
      exam.examId,
      user.sub,
      async (tx, a) => {
        const settled = await this.settle(tx, exam, a, questions, now);
        if (settled.finishedAt !== null) return settled;
        return this.repo.updateAttempt(tx, a.id, {
          holderId,
          lastSeq: 0,
          countedAt: now,
        });
      }
    );
    if (!attempt) throw new AttemptNotFoundError(lessonId);
    if (attempt.finishedAt !== null && starting) {
      throw new ExamAlreadyTakenError(lessonId);
    }
    if (attempt.finishedAt !== null) throw new AttemptNotFoundError(lessonId);
    return this.view(exam, attempt, questions);
  }

  /**
   * Runs a write of the holding page on its attempt: the attempt is settled
   * first, its holder checked, its clock counted; `fn` then writes. A
   * refusal is thrown after the transaction, so a finish it settled stays.
   */
  private async onHeld<T>(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string,
    fn: (
      tx: Tx,
      ctx: {
        exam: IPublishedExam;
        attempt: IAttempt;
        questions: IDraftQuestion[];
        used: number;
        now: Date;
      }
    ) => Promise<Outcome<T>>
  ): Promise<T> {
    const exam = await this.examFor(user, lessonId);
    const questions = await this.questionsOf(exam);
    const now = new Date();
    const outcome = await this.repo.inAttempt(
      exam.examId,
      user.sub,
      async (tx, a) => {
        const settled = await this.settle(tx, exam, a, questions, now);
        if (settled.finishedAt !== null) return { refused: "ended" } as const;
        if (settled.holderId !== holderId) {
          return { refused: "elsewhere" } as const;
        }
        const used = this.counted(exam, settled, now);
        if (used >= exam.durationMinutes * 60) {
          await this.finish(tx, settled, questions, FinishedBy.TIME, now, used);
          return { refused: "ended" } as const;
        }
        return fn(tx, { exam, attempt: settled, questions, used, now });
      }
    );
    if (outcome === null) throw new AttemptNotFoundError(lessonId);
    if ("refused" in outcome) {
      switch (outcome.refused) {
        case "ended":
          throw new AttemptEndedError(lessonId);
        case "elsewhere":
          throw new AttemptHeldElsewhereError(lessonId);
        case "question":
          throw new AttemptQuestionNotFoundError(lessonId);
        default:
          throw new AnswerInvalidError(lessonId);
      }
    }
    return outcome.ok;
  }

  /**
   * Saves one answer the moment it is chosen, and the question the talebe is
   * on. The last save wins by the page's own count: one whose seq is not
   * above the stored one writes nothing and is answered with what is held.
   */
  async saveAnswer(
    user: AuthenticatedUser,
    lessonId: string,
    questionId: string,
    dto: SaveExamAnswerDto
  ): Promise<ExamAnswerSavedResponse> {
    return this.onHeld<ExamAnswerSavedResponse>(
      user,
      lessonId,
      dto.holderId,
      async (tx, c) => {
        const q = c.attempt.questionOrder.includes(questionId)
          ? c.questions.find((it) => it.id === questionId)
          : undefined;
        if (!q) return { refused: "question" };
        if (
          !answerFits(
            q.answerMode,
            dto.optionIds,
            q.options.map((o) => o.id)
          )
        ) {
          return { refused: "answer" };
        }
        const left = secondsLeft(c.exam.durationMinutes, c.used);
        if (dto.seq <= c.attempt.lastSeq) {
          const held = (await this.repo.answersOf(c.attempt.id, tx)).find(
            (a) => a.questionId === questionId
          );
          await this.repo.updateAttempt(tx, c.attempt.id, {
            usedSeconds: c.used,
            countedAt: c.now,
          });
          return {
            ok: {
              questionId,
              optionIds: held?.optionIds ?? [],
              skipped: held?.skipped ?? false,
              written: false,
              secondsLeft: left,
            },
          };
        }
        const saved = await this.repo.saveAnswer(tx, {
          attemptId: c.attempt.id,
          questionId,
          optionIds: dto.optionIds,
          skipped: dto.skipped,
          at: c.now,
        });
        const current =
          dto.currentQuestionId &&
          c.attempt.questionOrder.includes(dto.currentQuestionId)
            ? dto.currentQuestionId
            : questionId;
        await this.repo.updateAttempt(tx, c.attempt.id, {
          lastSeq: dto.seq,
          currentQuestionId: current,
          usedSeconds: c.used,
          countedAt: c.now,
        });
        return {
          ok: {
            questionId,
            optionIds: saved.optionIds,
            skipped: saved.skipped,
            written: true,
            secondsLeft: left,
          },
        };
      }
    );
  }

  /** Counts the time while the holding page is connected; at the end of the time the attempt finishes. */
  async tick(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string
  ): Promise<ExamClockResponse> {
    try {
      return await this.onHeld(user, lessonId, holderId, async (tx, c) => {
        await this.repo.updateAttempt(tx, c.attempt.id, {
          usedSeconds: c.used,
          countedAt: c.now,
        });
        return {
          ok: {
            secondsLeft: secondsLeft(c.exam.durationMinutes, c.used),
            status: AttemptStatus.IN_PROGRESS,
          },
        };
      });
    } catch (error) {
      if (error instanceof AttemptEndedError) {
        return { secondsLeft: 0, status: AttemptStatus.FINISHED };
      }
      throw error;
    }
  }

  /** Counts a deliberate switch to another tab or window; nothing is erased. */
  async recordSwitch(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string
  ): Promise<ExamAttemptResponse> {
    const { exam, attempt, questions } = await this.onHeld(
      user,
      lessonId,
      holderId,
      async (tx, c) => {
        await this.repo.updateAttempt(tx, c.attempt.id, {
          usedSeconds: c.used,
          countedAt: c.now,
        });
        const counted = await this.repo.recordSwitch(tx, c.attempt.id, c.now);
        return {
          ok: { exam: c.exam, attempt: counted, questions: c.questions },
        };
      }
    );
    return this.view(exam, attempt, questions);
  }

  /** "Sınavı bitir": ends the attempt with the answers saved, and scores it. */
  async finishAttempt(
    user: AuthenticatedUser,
    lessonId: string,
    holderId: string
  ): Promise<ExamAttemptResponse> {
    try {
      const { exam, attempt, questions } = await this.onHeld(
        user,
        lessonId,
        holderId,
        async (tx, c) => ({
          ok: {
            exam: c.exam,
            questions: c.questions,
            attempt: await this.finish(
              tx,
              c.attempt,
              c.questions,
              FinishedBy.TALEBE,
              c.now,
              c.used
            ),
          },
        })
      );
      return this.view(exam, attempt, questions);
    } catch (error) {
      // Finished meanwhile, by the time or an early close: the page reads it as finished.
      if (error instanceof AttemptEndedError) {
        const exam = await this.examFor(user, lessonId);
        const attempt = await this.repo.findAttempt(exam.examId, user.sub);
        if (attempt) return this.view(exam, attempt, []);
      }
      throw error;
    }
  }
}
