import { randomInt } from "node:crypto";
import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseService } from "../course/course.service";
import { CourseNotFoundError } from "../course/errors/course-not-found.error";
import { answerFits, drawOrder } from "../online-exam/domain/exam-attempt";
import {
  ExamKind,
  lacksOf,
  pointsText,
} from "../online-exam/domain/online-exam";
import {
  type IDraftQuestion,
  OnlineExamRepository,
} from "../online-exam/online-exam.repository";
import { noteOf } from "../question-note/domain/question-note";
import { QuestionNoteRepository } from "../question-note/question-note.repository";
import {
  drawPool,
  isCompleteCounted,
  PoolMode,
  PracticeAttemptStatus,
  partText,
  poolCountFits,
  practiceResult,
} from "./domain/practice";
import type {
  PracticeAnswerSavedResponse,
  PracticeAttemptResponse,
  PracticeAttemptSummaryResponse,
  PracticePoolAttemptSummaryResponse,
  PracticePoolResponse,
  PracticeResultResponse,
  PracticeSetStatsResponse,
  PracticeSetSummaryResponse,
} from "./dto/practice.dto";
import {
  PracticeAnswerInvalidError,
  PracticeAttemptFinishedError,
  PracticeAttemptNotFoundError,
  PracticeForbiddenError,
  PracticePoolCountInvalidError,
  PracticeQuestionNotFoundError,
  PracticeSetNotFoundError,
} from "./errors/practice.errors";
import {
  type IAttemptQuestion,
  type IPracticeAttempt,
  type IPracticeSet,
  PracticeRepository,
  type Tx,
} from "./practice.repository";

/** How many of the caller's latest pool attempts the pool's page lists. */
const POOL_ATTEMPTS_LISTED = 10;

/** A random number in [0, 1) from the system's cryptographic source. */
const fairRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

const scored = (q: IDraftQuestion | IAttemptQuestion) => ({
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

const poolSummaryOf = (
  a: IPracticeAttempt
): PracticePoolAttemptSummaryResponse => ({
  id: a.id,
  mode: a.poolMode ?? PoolMode.ALL,
  questionCount: a.questionOrder.length,
  status: statusOf(a),
  startedAt: a.startedAt,
  finishedAt: a.finishedAt,
  result: resultOf(a),
});

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
    private readonly courses: CourseService,
    private readonly notes: QuestionNoteRepository
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
  private async setQuestions(
    courseId: string,
    setId: string,
    tx?: Tx
  ): Promise<IDraftQuestion[]> {
    const draft = await this.exams.findDraft(courseId, setId, tx);
    return draft?.questions ?? [];
  }

  /**
   * The attempt's questions, a set's or the pool's alike: only the ones it
   * drew, by id, with their set's title.
   */
  private questionsOf(
    attempt: IPracticeAttempt,
    ids: string[] = attempt.questionOrder
  ): Promise<IAttemptQuestion[]> {
    return this.repo.questionsByIds(ids);
  }

  /** Refuses a caller who is no talebe of the course; a course they may not see is not found. */
  private async assertTalebe(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<void> {
    await this.courses.getDetail(courseId, user, { read: true });
    if (!(await this.courses.mayWriteAsTalebe(user, courseId))) {
      throw new PracticeForbiddenError(courseId);
    }
  }

  /** The ids of the course's pool: the complete questions of its published sets. */
  private async poolIds(courseId: string, tx?: Tx): Promise<string[]> {
    return (await this.repo.countedPoolQuestions(courseId, tx))
      .filter(isCompleteCounted)
      .map((q) => q.id);
  }

  /** The course's published sets, for its talebe. */
  async listCourseSets(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<PracticeSetSummaryResponse[]> {
    // A course the caller may not see is not found; one they see but are
    // no talebe of is refused.
    await this.assertTalebe(user, courseId);
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
          await this.setQuestions(set.courseId, setId, tx)
        ).filter((q) => lacksOf(q, ExamKind.PRACTICE).length === 0);
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
      ? (await this.questionsOf(attempt, [questionId]))[0]
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
    const questions = await this.questionsOf(attempt);
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

  /**
   * The course's question pool for its talebe: how many questions it holds,
   * the pool attempt in progress and the latest ones.
   */
  async pool(
    user: AuthenticatedUser,
    courseId: string
  ): Promise<PracticePoolResponse> {
    await this.assertTalebe(user, courseId);
    const [ids, attempts] = await Promise.all([
      this.poolIds(courseId),
      this.repo.poolAttemptsOf(user.sub, courseId, POOL_ATTEMPTS_LISTED),
    ]);
    return {
      courseId,
      questionCount: ids.length,
      openAttemptId: attempts.find((a) => a.finishedAt === null)?.id ?? null,
      attempts: attempts.map(poolSummaryOf),
    };
  }

  /**
   * Starts a pool attempt: every question of the course's published sets
   * (ALL), or `count` of them at random, none twice (RANDOM), each one's
   * options in an order of the attempt's own. A pool attempt in progress is
   * returned instead, as it stands, whatever was asked.
   */
  async startPool(
    user: AuthenticatedUser,
    courseId: string,
    mode: PoolMode,
    count: number | undefined,
    retried = false
  ): Promise<PracticeAttemptResponse> {
    await this.assertTalebe(user, courseId);
    const open = await this.repo.findOpenPoolAttempt(user.sub, courseId);
    if (open) return this.view(open);
    const made = await this.repo.startPoolAttempt(
      { courseId, userId: user.sub, poolMode: mode },
      async (tx) => {
        const ids = await this.poolIds(courseId, tx);
        if (!poolCountFits(mode, count, ids.length)) {
          throw new PracticePoolCountInvalidError(courseId, count, ids.length);
        }
        const questionOrder = drawPool(ids, mode, count, (all) =>
          drawOrder(all, fairRandom)
        );
        const options = new Map<string, string[]>();
        for (const o of await this.repo.optionIdsOf(questionOrder, tx)) {
          options.set(o.questionId, [
            ...(options.get(o.questionId) ?? []),
            o.id,
          ]);
        }
        return {
          questionOrder,
          optionOrder: Object.fromEntries(
            questionOrder.map((id) => [
              id,
              drawOrder(options.get(id) ?? [], fairRandom),
            ])
          ),
        };
      }
    );
    // Null only when another start won the race and that attempt was
    // finished before it could be read back: start again, once.
    if (!made) {
      if (retried) throw new PracticeForbiddenError(courseId);
      return this.startPool(user, courseId, mode, count, true);
    }
    return this.view(made);
  }

  /**
   * How the course's published sets were solved, for its team: per set,
   * how many talebe finished it, how many times, and their average
   * percentage. Pool attempts are not a set's and are not counted.
   */
  async setStats(courseId: string): Promise<PracticeSetStatsResponse[]> {
    const stats = await this.repo.setStats(courseId);
    return stats.map((s) => ({
      setId: s.setId,
      talebeCount: s.talebeCount,
      attemptCount: s.attemptCount,
      averagePercent:
        s.averageHundredths === null ? null : pointsText(s.averageHundredths),
    }));
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
    const [questions, answers, set, notes] = await Promise.all([
      this.questionsOf(attempt),
      this.repo.answersOf(attempt.id),
      title === undefined && attempt.setId !== null
        ? this.repo.findSet(attempt.setId)
        : Promise.resolve(null),
      // The talebe's own notes (soru notları): nothing of the answer.
      this.notes.mineByQuestion(attempt.userId, attempt.questionOrder),
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
      setId: attempt.setId,
      poolMode: attempt.poolMode,
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
          setTitle: q.setTitle,
          options: (attempt.optionOrder[q.id] ?? []).flatMap((optionId) => {
            const o = options.get(optionId);
            if (!o) return [];
            return finished
              ? [{ id: o.id, text: o.text, correct: o.correct }]
              : [{ id: o.id, text: o.text }];
          }),
          chosenOptionIds: chosen.get(q.id) ?? [],
          ...(r ? { outcome: r.outcome, part: partText(r.part) } : {}),
          talebeNotes: q.talebeNotes,
          myNote: noteOf(notes, q.id),
        };
      }),
      result: resultOf(attempt),
    };
  }
}
