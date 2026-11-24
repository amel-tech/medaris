import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  PERMISSIONS,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import {
  earnedPart,
  FinishedBy,
  latestStartOf,
  scoreHundredths,
} from "./domain/exam-attempt";
import {
  AnswerVerdict,
  type AttemptTally,
  averagePercent,
  closedForEveryone,
  earnedHundredths,
  mayCloseEarly,
  percentOf,
  type ResultQuestion,
  TalebeExamState,
  tallyAttempt,
  verdictOf,
} from "./domain/exam-results";
import { pointsText, sharePoints, shareText } from "./domain/online-exam";
import type {
  OnlineExamClosedResponse,
  OnlineExamResultsResponse,
  ResultsTalebeResponse,
  TalebeAnswersResponse,
} from "./dto/exam-results.dto";
import {
  ExamNotOpenError,
  TalebeAttemptNotFoundError,
} from "./errors/exam-results.errors";
import { OnlineExamNotFoundError } from "./errors/online-exam.errors";
import type { IAttempt, Tx } from "./exam-attempt.repository";
import {
  ExamResultsRepository,
  type IResultsExam,
} from "./exam-results.repository";
import {
  type IDraftQuestion,
  OnlineExamRepository,
} from "./online-exam.repository";

/**
 * What "Sonuçları talebelere aç" runs for an online exam inside its own
 * transaction, at the release's time (`closingForRelease`).
 */
export type ReleaseClose = (
  tx: Tx,
  write: { actorId: string; at: Date }
) => Promise<void>;

/** An exam held for an end: its row read again under the lock, and its attempts in progress, held. */
interface IHeldExam {
  exam: IResultsExam;
  inProgress: IAttempt[];
  latest: Date;
}

/** The draft's questions as the scoring and the tallies read them. */
const resultQuestionsOf = (
  questions: readonly IDraftQuestion[]
): ResultQuestion[] =>
  questions.map((q) => ({
    id: q.id,
    answerMode: q.answerMode,
    scoring: q.scoring,
    ownHundredths: q.ownPoints,
    options: q.options,
    topicIds: q.topicIds,
  }));

/**
 * The course team's results of an online exam (MDRS-299, nazar.exams.results)
 * and its early close. Those who prepare the exam read its results (the
 * owner, 22 Nov 2026: "görebilsin, soruları hazırlayanlar için değerli
 * olabilir sonraki hazırlamada"); releasing them stays the existing
 * `releaseExamResults`, under `session.manage`, so the read says whether the
 * caller holds it (`mayRelease`).
 *
 * An attempt's clock runs only while its page is connected (the owner,
 * 21 Nov 2026), so an attempt whose page went away stays in progress: the
 * early close, or the release of the results, is what ends it, with the
 * answers saved so far.
 */
@Injectable()
export class ExamResultsService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ExamResultsRepository,
    private readonly exams: OnlineExamRepository,
    private readonly authz: AuthzService
  ) {}

  async results(
    examId: string,
    user: AuthenticatedUser,
    now: Date = new Date()
  ): Promise<OnlineExamResultsResponse> {
    const exam = await this.repo.findExam(examId);
    if (!exam) throw new OnlineExamNotFoundError(examId);
    const [draft, topics, seated, attempts, zerothAnswers, zerothOptions] =
      await Promise.all([
        this.exams.findDraft(exam.courseId, examId),
        this.exams.listTopics(exam.courseId),
        this.repo.listSeated(exam.courseId),
        this.repo.listAttempts(examId),
        this.repo.listZerothAnswers(examId),
        this.repo.listZerothOptions(examId),
      ]);
    const questions = resultQuestionsOf(draft?.questions ?? []);
    const ids = attempts.map((a) => a.id);
    const [answers, switches, mayRelease] = await Promise.all([
      this.repo.listAnswers(ids),
      this.repo.listSwitches(ids),
      this.authz.can(
        user,
        { entity: ENTITIES.COURSE, id: exam.courseId },
        PERMISSIONS.SESSION_MANAGE
      ),
    ]);

    const latest = latestStartOf(exam.startsAt, exam.latestStartAt);
    const seatedIds = new Set(seated.map((s) => s.userId));
    const ofSeated = attempts.filter((a) => seatedIds.has(a.userId));
    const inProgress = ofSeated.filter((a) => a.finishedAt === null).length;
    const closed = closedForEveryone(
      now,
      latest,
      exam.closedEarlyAt,
      inProgress
    );
    const byUser = new Map(ofSeated.map((a) => [a.userId, a]));
    const zerothOf = new Map(zerothAnswers.map((z) => [z.userId, z.optionId]));

    const tallies = new Map<string, AttemptTally>();
    for (const attempt of ofSeated) {
      if (attempt.finishedAt === null) continue;
      const chosen = new Map(
        answers
          .filter((a) => a.attemptId === attempt.id)
          .map((a) => [a.questionId, a.optionIds])
      );
      tallies.set(attempt.id, tallyAttempt(questions, chosen));
    }
    const finished = ofSeated.filter((a) => a.finishedAt !== null);
    const carried = new Set(questions.flatMap((q) => q.topicIds));

    const talebe: ResultsTalebeResponse[] = seated.map((person) => {
      const attempt = byUser.get(person.userId);
      const tally = attempt ? tallies.get(attempt.id) : undefined;
      const state = !attempt
        ? closed
          ? TalebeExamState.MISSED
          : TalebeExamState.NOT_STARTED
        : attempt.finishedAt === null
          ? TalebeExamState.IN_PROGRESS
          : TalebeExamState.FINISHED;
      return {
        userId: person.userId,
        name: person.name,
        state,
        startedAt: attempt?.startedAt ?? null,
        finishedAt: attempt?.finishedAt ?? null,
        finishedBy: attempt?.finishedBy ?? null,
        score:
          attempt?.scoreHundredths === null ||
          attempt?.scoreHundredths === undefined
            ? null
            : pointsText(attempt.scoreHundredths),
        right: tally?.right ?? null,
        wrong: tally?.wrong ?? null,
        blank: tally?.blank ?? null,
        switches: attempt
          ? switches
              .filter((s) => s.attemptId === attempt.id)
              .map((s) => ({ at: s.at }))
          : [],
        zerothOptionId: zerothOf.get(person.userId) ?? null,
        topics: tally
          ? [...tally.topics].map(([topicId, percent]) => ({
              topicId,
              percent,
            }))
          : [],
      };
    });

    const scores = finished
      .map((a) => a.scoreHundredths)
      .filter((s): s is number => s !== null);
    const { points } = sharePoints(
      questions.map((q) => ({ id: q.id, ownHundredths: q.ownHundredths }))
    );
    const finishedTallies = [...tallies.values()];
    const finishedAnswers = answers.filter((a) =>
      finished.some((f) => f.id === a.attemptId)
    );

    return {
      exam: {
        id: exam.examId,
        courseId: exam.courseId,
        lessonId: exam.lessonId,
        title: exam.title,
        durationMinutes: exam.durationMinutes,
        startsAt: exam.startsAt,
        latestStartAt: latest,
        closedEarlyAt: exam.closedEarlyAt,
        closed,
        mayClose: mayCloseEarly(
          now,
          exam.startsAt,
          latest,
          exam.closedEarlyAt,
          inProgress
        ),
      },
      talebe,
      counts: {
        seats: seated.length,
        started: ofSeated.length,
        inProgress,
        finished: finished.length,
        missed: closed ? seated.length - ofSeated.length : 0,
        average:
          scores.length === 0
            ? null
            : pointsText(
                Math.floor(
                  scores.reduce((a, b) => a + b, 0) / scores.length + 0.5
                )
              ),
      },
      topics: topics
        .filter((topic) => carried.has(topic.id))
        .map((topic) => ({
          topicId: topic.id,
          number: topic.number,
          name: topic.name,
          percent: averagePercent(
            finishedTallies.map((t) => t.topics.get(topic.id) ?? null)
          ),
          questionCount: questions.filter((q) => q.topicIds.includes(topic.id))
            .length,
        })),
      questions: (draft?.questions ?? []).map((q, i) => {
        const verdicts = finishedTallies.map((t) => t.verdicts.get(q.id));
        const p = points.get(q.id);
        return {
          questionId: q.id,
          number: i + 1,
          text: q.text,
          answerMode: q.answerMode,
          points: p ? shareText(p) : pointsText(0),
          rightPercent: percentOf(
            verdicts.filter((v) => v === AnswerVerdict.RIGHT).length,
            finishedTallies.length
          ),
          blank: verdicts.filter((v) => v === AnswerVerdict.BLANK).length,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            correct: o.correct,
            chosen: finishedAnswers.filter(
              (a) => a.questionId === q.id && a.optionIds.includes(o.id)
            ).length,
          })),
        };
      }),
      zeroth: {
        question: exam.zerothQuestion,
        options: zerothOptions.map((o) => ({
          id: o.id,
          text: o.text,
          count: zerothAnswers.filter((z) => z.optionId === o.id).length,
        })),
      },
      released: exam.resultsReleasedAt !== null,
      releasedAt: exam.resultsReleasedAt,
      mayRelease,
      releasable: exam.lessonExamId !== null,
    };
  }

  /**
   * One talebe's answers, question by question (the owner, 22 Nov 2026:
   * "sınav sonuçlarında talebeye tıklayıp hangi soruya ne cevap verdiğini
   * ayrıca görebilmek lazım"): each question in the exam's order, not the
   * talebe's, with its options, the correct marks, what the talebe chose, and
   * the points the answer earned. The team reads it before the release too,
   * as it reads the results; like the results read, it writes no audit row.
   * A talebe not seated in the course, or with no attempt, is
   * ATTEMPT_NOT_FOUND.
   */
  async talebeAnswers(
    examId: string,
    userId: string
  ): Promise<TalebeAnswersResponse> {
    const exam = await this.repo.findExam(examId);
    if (!exam) throw new OnlineExamNotFoundError(examId);
    const [draft, seated, attempt] = await Promise.all([
      this.exams.findDraft(exam.courseId, examId),
      this.repo.listSeated(exam.courseId),
      this.repo.findAttemptOf(examId, userId),
    ]);
    const person = seated.find((s) => s.userId === userId);
    if (!person || !attempt) {
      throw new TalebeAttemptNotFoundError(examId, userId);
    }
    const [answers, switches, zerothAnswers, zerothOptions] = await Promise.all(
      [
        this.repo.answersOfAttempt(attempt.id),
        this.repo.listSwitches([attempt.id]),
        this.repo.listZerothAnswers(examId),
        this.repo.listZerothOptions(examId),
      ]
    );
    const drafted = draft?.questions ?? [];
    const scored = resultQuestionsOf(drafted);
    const { points } = sharePoints(
      scored.map((q) => ({ id: q.id, ownHundredths: q.ownHundredths }))
    );
    const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
    const zerothId =
      zerothAnswers.find((z) => z.userId === userId)?.optionId ?? null;
    return {
      exam: { id: exam.examId, title: exam.title },
      userId,
      name: person.name,
      state:
        attempt.finishedAt === null
          ? TalebeExamState.IN_PROGRESS
          : TalebeExamState.FINISHED,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      finishedBy: attempt.finishedBy,
      score:
        attempt.scoreHundredths === null
          ? null
          : pointsText(attempt.scoreHundredths),
      switches: switches.map((s) => ({ at: s.at })),
      zeroth: {
        question: exam.zerothQuestion,
        optionId: zerothId,
        answer: zerothOptions.find((o) => o.id === zerothId)?.text ?? null,
      },
      questions: drafted.map((q, i) => {
        const answer = byQuestion.get(q.id);
        const chosen = answer?.optionIds ?? [];
        const p = points.get(q.id);
        return {
          questionId: q.id,
          number: i + 1,
          text: q.text,
          answerMode: q.answerMode,
          scoring: q.scoring,
          points: p ? shareText(p) : pointsText(0),
          earned: pointsText(
            earnedHundredths(p, earnedPart(scored[i], chosen))
          ),
          verdict: verdictOf(scored[i], chosen),
          skipped: answer?.skipped ?? false,
          savedAt: answer?.savedAt ?? null,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            correct: o.correct,
            chosen: chosen.includes(o.id),
          })),
        };
      }),
    };
  }

  /**
   * "Sınavı erken bitir": every attempt in progress ends now with the answers
   * saved so far, scored and written where Değerlendirme reads it, and no one
   * starts it any more. Written to `audit_log` as `online_exam.close`.
   */
  async close(
    examId: string,
    user: AuthenticatedUser,
    now: Date = new Date()
  ): Promise<OnlineExamClosedResponse> {
    const questions = await this.questionsToScore(examId);
    return this.repo.transaction(async (tx) => {
      const held = await this.hold(tx, examId);
      if (
        !mayCloseEarly(
          now,
          held.exam.startsAt,
          held.latest,
          held.exam.closedEarlyAt,
          held.inProgress.length
        )
      ) {
        throw new ExamNotOpenError(examId);
      }
      const finished = await this.endForEveryone(tx, held, questions, {
        actorId: user.sub,
        at: now,
      });
      return { examId, closedEarlyAt: now, finished };
    });
  }

  /**
   * The online exam's part of "Sonuçları talebelere aç" (MDRS-299; the
   * owner, 24 Nov 2026, "Önerini uygula"): releasing an online exam's results
   * ends it for everyone, as "Sınavı erken bitir" does, so each talebe reads
   * their answers with the correct ones as soon as the results are out.
   *
   * Null when the celse has no published online exam: a written or oral
   * exam is released as it always was. Otherwise the step the release runs
   * in its own transaction, before it opens the results, at the release's
   * time: refused before the exam opens (EXAM_NOT_OPEN), which would close
   * it before anyone took it; nothing when it has closed for everyone
   * already (closed early, or past its latest start with no one in it), so
   * its `closedEarlyAt` stays as it was; else every attempt in progress ends
   * with its saved answers and the exam is closed early.
   */
  async closingForRelease(lessonId: string): Promise<ReleaseClose | null> {
    const examId = await this.repo.examIdOfLesson(lessonId);
    if (!examId) return null;
    const questions = await this.questionsToScore(examId);
    return async (tx, write) => {
      const held = await this.hold(tx, examId);
      if (write.at.getTime() < held.exam.startsAt.getTime()) {
        throw new ExamNotOpenError(examId);
      }
      if (
        closedForEveryone(
          write.at,
          held.latest,
          held.exam.closedEarlyAt,
          held.inProgress.length
        )
      ) {
        return;
      }
      await this.endForEveryone(tx, held, questions, {
        ...write,
        via: "exam.release",
      });
    };
  }

  /** A published exam's questions as the scoring reads them; they no longer change (EXAM_LOCKED). */
  private async questionsToScore(examId: string): Promise<ResultQuestion[]> {
    const found = await this.repo.findExam(examId);
    if (!found) throw new OnlineExamNotFoundError(examId);
    return resultQuestionsOf(
      (await this.exams.findDraft(found.courseId, examId))?.questions ?? []
    );
  }

  /** The exam's row held for an end, read again under it, with its attempts in progress held too. */
  private async hold(tx: Tx, examId: string): Promise<IHeldExam> {
    await this.repo.holdExam(tx, examId);
    const exam = await this.repo.findExam(examId, tx);
    if (!exam) throw new OnlineExamNotFoundError(examId);
    const inProgress = await this.repo.holdInProgress(tx, examId);
    return {
      exam,
      inProgress,
      latest: latestStartOf(exam.startsAt, exam.latestStartAt),
    };
  }

  /**
   * Ends the held exam for everyone, in the caller's transaction: every
   * attempt in progress ends at `at` with the answers saved so far
   * (CLOSED_EARLY), is scored and written where Değerlendirme reads it, and
   * the exam is closed early at `at`, so no one starts it any more. Returns
   * how many attempts it ended.
   */
  private async endForEveryone(
    tx: Tx,
    held: IHeldExam,
    questions: ResultQuestion[],
    write: { actorId: string; at: Date; via?: "exam.release" }
  ): Promise<number> {
    const { exam, inProgress } = held;
    for (const attempt of inProgress) {
      const answers = await this.repo.answersOf(tx, attempt.id);
      const score = scoreHundredths(
        questions,
        new Map(answers.map((a) => [a.questionId, a.optionIds]))
      );
      await this.repo.finishAttempt(tx, attempt.id, {
        finishedAt: write.at,
        finishedBy: FinishedBy.CLOSED_EARLY,
        scoreHundredths: score,
      });
      await this.repo.writeExamResult(tx, {
        examId: exam.examId,
        userId: attempt.userId,
        scoreHundredths: score,
        gradedBy: write.actorId,
      });
    }
    await this.repo.markClosed(tx, {
      examId: exam.examId,
      courseId: exam.courseId,
      actorId: write.actorId,
      at: write.at,
      finished: inProgress.length,
      via: write.via,
    });
    return inProgress.length;
  }
}
