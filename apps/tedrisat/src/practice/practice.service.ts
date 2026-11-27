import { randomInt } from "node:crypto";
import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { answerFits, drawOrder } from "../online-exam/domain/exam-attempt";
import { lacksOf, pointsText } from "../online-exam/domain/online-exam";
import {
  type IDraftQuestion,
  OnlineExamRepository,
} from "../online-exam/online-exam.repository";
import {
  isCompleteCounted,
  PracticeAttemptStatus,
  partText,
  practiceResult,
} from "./domain/practice";
import type {
  PracticeAnswerSavedResponse,
  PracticeAttemptResponse,
  PracticeAttemptSummaryResponse,
  PracticeResultResponse,
  PracticeSetSummaryResponse,
} from "./dto/practice.dto";
import {
  PracticeAnswerInvalidError,
  PracticeAttemptFinishedError,
  PracticeAttemptNotFoundError,
  PracticeForbiddenError,
  PracticeQuestionNotFoundError,
  PracticeSetNotFoundError,
} from "./errors/practice.errors";
import {
  type IPracticeAttempt,
  type IPracticeSet,
  PracticeRepository,
  type Tx,
} from "./practice.repository";

/** A random number in [0, 1) from the system's cryptographic source. */
const fairRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

const scored = (q: IDraftQuestion) => ({
  id: q.id,
  answerMode: q.answerMode,
  scoring: q.scoring,
  ownHundredths: q.ownPoints,
  options: q.options,
});

const resultOf = (a: IPracticeAttempt): PracticeResultResponse | null =>
  a.finishedAt === null || a.scoreHundredths === null
    ? null
    : {
        correct: a.correctCount ?? 0,
        wrong: a.wrongCount ?? 0,
        blank: a.blankCount ?? 0,
        total: a.questionOrder.length,
        percent: pointsText(a.scoreHundredths),
      };

const statusOf = (a: IPracticeAttempt) =>
  a.finishedAt === null
    ? PracticeAttemptStatus.IN_PROGRESS
    : PracticeAttemptStatus.FINISHED;

/**
 * A talebe's çalışma soruları in tedris (MDRS-248): the published çalışma
 * setleri of their courses, an attempt at one in an order of its own, every
 * answer saved as it is chosen, and the finish, which shows at once how it
 * went and the correct options. There is no clock, no holder and no tab
 * count; a set is solved as often as the talebe likes, one attempt of it in
 * progress at a time.
 *
 * Only a talebe of the course who may write on it as one (`mayWriteAsTalebe`:
 * an ENROLLED or COMPLETED seat, no ban, its content open) reaches its sets.
 * Nothing before the finish says which options are correct.
 */
@Injectable()
export class PracticeService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: PracticeRepository,
    private readonly exams: OnlineExamRepository,
    private readonly courses: CourseService
  ) {}

  /** Whether the caller may solve the course's sets: they see the course and write on it as a talebe. */
  private async mayPractise(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<boolean> {
    try {
      await this.courses.getDetail(courseId, user, { read: true });
    } catch (error) {
      if (error instanceof CourseNotFoundError) return false;
      throw error;
    }
    return this.courses.mayWriteAsTalebe(user, courseId);
  }

  /** The published set, for a caller who may solve it; PRACTICE_SET_NOT_FOUND otherwise. */
  private async setFor(
    user: AuthenticatedUser,
    setId: string
  ): Promise<IPracticeSet> {
    const set = await this.repo.findSet(setId);
    if (!set || !(await this.mayPractise(user, set.courseId))) {
      throw new PracticeSetNotFoundError(setId);
    }
    return set;
  }

  /** The caller's own attempt, while they may still solve its course's sets. */
  private async attemptFor(
    user: AuthenticatedUser,
    attemptId: string
  ): Promise<IPracticeAttempt> {
    const attempt = await this.repo.findAttempt(attemptId, user.sub);
    if (!attempt || !(await this.mayPractise(user, attempt.courseId))) {
      throw new PracticeAttemptNotFoundError(attemptId);
    }
    return attempt;
  }

  /** The set's questions, every one as the team wrote it. */
  private async questionsOf(
    courseId: string,
    setId: string | null,
    tx?: Tx
  ): Promise<IDraftQuestion[]> {
    if (setId === null) return [];
    const draft = await this.exams.findDraft(courseId, setId, tx);
    return draft?.questions ?? [];
  }

  /** The course's published sets, for its talebe. */
  async listCourseSets(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<PracticeSetSummaryResponse[]> {
    // A course the caller may not see is not found; one they see but are
    // no talebe of is refused.
    await this.courses.getDetail(courseId, user, { read: true });
    if (!(await this.courses.mayWriteAsTalebe(user, courseId))) {
      throw new PracticeForbiddenError(courseId);
    }
    return this.summaries(user.sub, await this.repo.listSets([courseId]));
  }

  /** The published sets of every course the caller may solve them in. */
  async listMySets(
    user: AuthenticatedUser
  ): Promise<PracticeSetSummaryResponse[]> {
    const seated = await this.repo.seatedCourseIds(user.sub);
    const open = await Promise.all(
      seated.map(async (id) => ((await this.mayPractise(user, id)) ? id : null))
    );
    const courseIds = open.filter((id): id is string => id !== null);
    return this.summaries(user.sub, await this.repo.listSets(courseIds));
  }

  private async summaries(
    userId: string,
    sets: IPracticeSet[]
  ): Promise<PracticeSetSummaryResponse[]> {
    const ids = sets.map((s) => s.id);
    const [questions, attempts] = await Promise.all([
      this.repo.countedQuestions(ids),
      this.repo.attemptsOf(userId, ids),
    ]);
    const counts = new Map<string, number>();
    for (const q of questions) {
      if (isCompleteCounted(q)) {
        counts.set(q.setId, (counts.get(q.setId) ?? 0) + 1);
      }
    }
    return sets.map((set) => {
      const mine = attempts.filter((a) => a.setId === set.id);
      const finished = mine
        .filter((a) => a.finishedAt !== null)
        .sort(
          (a, b) =>
            (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0)
        );
      const latest = finished[0];
      return {
        id: set.id,
        courseId: set.courseId,
        courseTitle: set.courseTitle,
        title: set.title,
        instructions: set.instructions,
        questionCount: counts.get(set.id) ?? 0,
        attemptCount: finished.length,
        lastPercent:
          latest?.scoreHundredths == null
            ? null
            : pointsText(latest.scoreHundredths),
        openAttemptId: mine.find((a) => a.finishedAt === null)?.id ?? null,
        publishedAt: set.publishedAt,
      };
    });
  }

  /**
   * Starts an attempt at the set: its complete questions, and each one's
   * options, in an order of this attempt's own. An attempt in progress is
   * returned instead, as it stands.
   */
  async start(
    user: AuthenticatedUser,
    setId: string
  ): Promise<PracticeAttemptResponse> {
    const set = await this.setFor(user, setId);
    const open = await this.repo.findOpenAttempt(user.sub, setId);
    if (open) return this.view(open, set.title);
    // Drawn once the set's row is held: no take-back, and so no change to
    // its questions, can come between the read and the attempt.
    const made = await this.repo.startAttempt(
      { setId, courseId: set.courseId, userId: user.sub },
      async (tx) => {
        const questions = (
          await this.questionsOf(set.courseId, setId, tx)
        ).filter((q) => lacksOf(q).length === 0);
        return {
          questionOrder: drawOrder(
            questions.map((q) => q.id),
            fairRandom
          ),
          optionOrder: Object.fromEntries(
            questions.map((q) => [
              q.id,
              drawOrder(
                q.options.map((o) => o.id),
                fairRandom
              ),
            ])
          ),
        };
      }
    );
    if (!made) throw new PracticeSetNotFoundError(setId);
    return this.view(made, set.title);
  }

  /** The caller's own attempt: the questions and their answers, and once finished, how it went. */
  async get(
    user: AuthenticatedUser,
    attemptId: string
  ): Promise<PracticeAttemptResponse> {
    return this.view(await this.attemptFor(user, attemptId));
  }

  /** Saves one answer the moment it is chosen; the question becomes the one the talebe is on. */
  async saveAnswer(
    user: AuthenticatedUser,
    attemptId: string,
    questionId: string,
    optionIds: string[]
  ): Promise<PracticeAnswerSavedResponse> {
    const attempt = await this.attemptFor(user, attemptId);
    const question = attempt.questionOrder.includes(questionId)
      ? (await this.questionsOf(attempt.courseId, attempt.setId)).find(
          (q) => q.id === questionId
        )
      : undefined;
    if (!question)
      throw new PracticeQuestionNotFoundError(attemptId, questionId);
    // Only the options the attempt drew, which are the question's own.
    if (
      !answerFits(
        question.answerMode,
        optionIds,
        attempt.optionOrder[questionId] ?? []
      )
    ) {
      throw new PracticeAnswerInvalidError(questionId);
    }
    const saved = await this.repo.inAttempt(
      attemptId,
      user.sub,
      async (tx, held) => {
        if (held.finishedAt !== null) {
          throw new PracticeAttemptFinishedError(attemptId);
        }
        const answer = await this.repo.saveAnswer(tx, {
          attemptId,
          questionId,
          optionIds,
          at: new Date(),
        });
        await this.repo.updateAttempt(tx, attemptId, {
          currentQuestionId: questionId,
        });
        return answer;
      }
    );
    if (!saved) throw new PracticeAttemptNotFoundError(attemptId);
    return {
      questionId,
      optionIds: saved.optionIds,
      savedAt: saved.savedAt,
    };
  }

  /**
   * "Bitir": ends the attempt with the answers saved, counts them and works
   * the percentage out. Finishing a finished attempt changes nothing.
   */
  async finish(
    user: AuthenticatedUser,
    attemptId: string
  ): Promise<PracticeAttemptResponse> {
    const attempt = await this.attemptFor(user, attemptId);
    const questions = await this.questionsOf(attempt.courseId, attempt.setId);
    const finished = await this.repo.inAttempt(
      attemptId,
      user.sub,
      async (tx, held) => {
        if (held.finishedAt !== null) return held;
        const answers = await this.repo.answersOf(attemptId, tx);
        const byId = new Map(questions.map((q) => [q.id, q]));
        const result = practiceResult(
          held.questionOrder.flatMap((id) => {
            const q = byId.get(id);
            return q ? [scored(q)] : [];
          }),
          new Map(answers.map((a) => [a.questionId, a.optionIds]))
        );
        return this.repo.updateAttempt(tx, attemptId, {
          finishedAt: new Date(),
          correctCount: result.correct,
          wrongCount: result.wrong,
          blankCount: result.blank,
          scoreHundredths: result.scoreHundredths,
        });
      }
    );
    if (!finished) throw new PracticeAttemptNotFoundError(attemptId);
    return this.view(finished);
  }

  /** The caller's attempts at the set, the latest first. */
  async listAttempts(
    user: AuthenticatedUser,
    setId: string
  ): Promise<PracticeAttemptSummaryResponse[]> {
    await this.setFor(user, setId);
    const attempts = await this.repo.attemptsOf(user.sub, [setId]);
    return attempts.map((a) => ({
      id: a.id,
      status: statusOf(a),
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      result: resultOf(a),
    }));
  }

  /**
   * The attempt as its page reads it. In progress, the questions and their
   * options in the attempt's order and the answers chosen, and nothing that
   * says which options are correct; once finished, each question's correct
   * options, its outcome and its part, and the counts and percentage.
   */
  private async view(
    attempt: IPracticeAttempt,
    title?: string
  ): Promise<PracticeAttemptResponse> {
    const [questions, answers, set] = await Promise.all([
      this.questionsOf(attempt.courseId, attempt.setId),
      this.repo.answersOf(attempt.id),
      title === undefined && attempt.setId !== null
        ? this.repo.findSet(attempt.setId)
        : Promise.resolve(null),
    ]);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const chosen = new Map(answers.map((a) => [a.questionId, a.optionIds]));
    const finished = attempt.finishedAt !== null;
    const ordered = attempt.questionOrder.flatMap((id) => {
      const q = byId.get(id);
      return q ? [q] : [];
    });
    const results = finished
      ? practiceResult(ordered.map(scored), chosen).questions
      : null;
    return {
      id: attempt.id,
      setId: attempt.setId ?? "",
      courseId: attempt.courseId,
      title: title ?? set?.title ?? "",
      status: statusOf(attempt),
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      currentQuestionId: attempt.currentQuestionId,
      questions: ordered.map((q, i) => {
        const options = new Map(q.options.map((o) => [o.id, o]));
        const r = results?.get(q.id);
        return {
          id: q.id,
          number: i + 1,
          text: q.text,
          answerMode: q.answerMode,
          options: (attempt.optionOrder[q.id] ?? []).flatMap((optionId) => {
            const o = options.get(optionId);
            if (!o) return [];
            return finished
              ? [{ id: o.id, text: o.text, correct: o.correct }]
              : [{ id: o.id, text: o.text }];
          }),
          chosenOptionIds: chosen.get(q.id) ?? [],
          ...(r ? { outcome: r.outcome, part: partText(r.part) } : {}),
        };
      }),
      result: resultOf(attempt),
    };
  }
}
