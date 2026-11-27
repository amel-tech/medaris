import type { AuthenticatedUser } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { CourseRepository } from "../course/course.repository";
import { CourseService } from "../course/course.service";
import { EnrollmentStatus } from "../course/domain/enrollment-status.enum";
import { ExamFormat } from "../course/domain/exam";
import { noteOf } from "../question-note/domain/question-note";
import { QuestionNoteRepository } from "../question-note/question-note.repository";
import {
  AttemptStatus,
  latestStartOf,
  type ScoredQuestion,
} from "./domain/exam-attempt";
import {
  countsOf,
  courseTallies,
  type Fraction,
  fractionText,
  gotIn,
  percentOf,
  questionResults,
  standingOf,
  type TopicTally,
  tallyByTopic,
  totalGot,
} from "./domain/exam-result";
import {
  closedForEveryone,
  isPast,
  lessonExamState,
  MyExamFormat,
  MyExamState,
  onlineExamState,
} from "./domain/my-exams";
import { pointsText } from "./domain/online-exam";
import type {
  MyCourseTopicStandingResponse,
  MyExamResponse,
  MyExamResultResponse,
  MyTopicStandingResponse,
} from "./dto/my-exams.dto";
import { AttemptNotFoundError } from "./errors/exam-attempt.errors";
import { OnlineExamNotFoundError } from "./errors/online-exam.errors";
import { ExamAttemptRepository } from "./exam-attempt.repository";
import { type IMyExamRow, MyExamsRepository } from "./my-exams.repository";
import {
  type IDraftQuestion,
  OnlineExamRepository,
} from "./online-exam.repository";

const SEATED = new Set<string>([
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.COMPLETED,
]);

const scored = (q: IDraftQuestion): ScoredQuestion => ({
  id: q.id,
  answerMode: q.answerMode,
  scoring: q.scoring,
  ownHundredths: q.ownPoints,
  options: q.options,
});

/** The weakest first; a tie in the topics' own order. */
const weakestFirst = (
  a: { percent: number; number: number },
  b: { percent: number; number: number }
) => a.percent - b.percent || a.number - b.number;

/**
 * A talebe's own exams in tedris (MDRS-299): "Sınavlarım", every exam of the
 * courses they hold a seat in, and their own screen of a past online exam.
 * Nothing about another talebe is read, and nothing is scored to the talebe
 * before the course team releases the results: until then the screen says
 * only that the exam was taken, when and how it ended. The correct options
 * come only once the exam has also closed for everyone.
 */
@Injectable()
export class MyExamsService {
  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: MyExamsRepository,
    private readonly attempts: ExamAttemptRepository,
    private readonly exams: OnlineExamRepository,
    private readonly courses: CourseService,
    private readonly courseRepo: CourseRepository,
    private readonly notes: QuestionNoteRepository
  ) {}

  /** Sınavlarım: the open and coming exams first, soonest first, then the past ones, latest first. */
  async list(userId: string, now = new Date()): Promise<MyExamResponse[]> {
    const rows = await this.repo.listForUser(userId);
    const listed = rows.map((row) => this.listed(row, now));
    const coming = listed.filter((e) => !isPast(e.state));
    const past = listed
      .filter((e) => isPast(e.state))
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
    return [...coming, ...past];
  }

  private listed(row: IMyExamRow, now: Date): MyExamResponse {
    const base = {
      lessonId: row.lessonId,
      courseId: row.courseId,
      courseTitle: row.courseTitle,
      startsAt: row.startsAt,
    };
    if (row.examId !== null) {
      const durationMinutes = row.durationMinutes ?? 0;
      const latest = latestStartOf(row.startsAt, row.latestStartAt);
      const state = onlineExamState({
        now,
        startsAt: row.startsAt,
        latestStartAt: latest,
        closedEarlyAt: row.closedEarlyAt,
        durationMinutes,
        attempt:
          row.attemptId === null
            ? null
            : {
                finishedAt: row.attemptFinishedAt,
                usedSeconds: row.attemptUsedSeconds ?? 0,
              },
        released: row.releasedAt !== null,
      });
      return {
        ...base,
        title: row.examTitle ?? row.lessonTitle,
        format: MyExamFormat.MULTIPLE_CHOICE,
        latestStartAt: latest,
        state,
        score:
          state === MyExamState.RELEASED && row.scoreHundredths !== null
            ? pointsText(row.scoreHundredths)
            : null,
        maxScore: 100,
        durationMinutes,
        questionCount: row.questionCount,
        place: null,
      };
    }
    const state = lessonExamState({
      now,
      startsAt: row.startsAt,
      released: row.releasedAt !== null,
      absent: row.resultAbsent,
    });
    return {
      ...base,
      title: row.lessonTitle,
      format:
        row.format === ExamFormat.ORAL
          ? MyExamFormat.ORAL
          : MyExamFormat.WRITTEN,
      latestStartAt: null,
      state,
      score:
        state === MyExamState.RELEASED && row.resultScore !== null
          ? String(row.resultScore)
          : null,
      maxScore: row.maxScore,
      durationMinutes: null,
      questionCount: null,
      place: row.location,
    };
  }

  /**
   * The caller's own screen of a past online exam: only theirs, and only an
   * exam they took (ATTEMPT_NOT_FOUND otherwise). An ENROLLED or COMPLETED
   * seat reads it; to anyone else there is no such exam.
   */
  async result(
    user: AuthenticatedUser,
    lessonId: string,
    now = new Date()
  ): Promise<MyExamResultResponse> {
    await this.courses.findVisibleLessonCourse(lessonId, user);
    const exam = await this.attempts.findPublishedByLesson(lessonId);
    if (!exam) throw new OnlineExamNotFoundError(lessonId);
    const seat = await this.courseRepo.findEnrollment(user.sub, exam.courseId);
    if (!seat || !SEATED.has(seat.status)) {
      throw new OnlineExamNotFoundError(lessonId);
    }
    const attempt = await this.attempts.findAttempt(exam.examId, user.sub);
    if (!attempt) throw new AttemptNotFoundError(lessonId);

    const latest = latestStartOf(exam.startsAt, exam.latestStartAt);
    const [releasedAt, anyInProgress] = await Promise.all([
      this.repo.releasedAt(lessonId),
      this.repo.anyInProgress(exam.examId, exam.durationMinutes),
    ]);
    const finished = attempt.finishedAt !== null;
    const released = releasedAt !== null && finished;
    const closed = closedForEveryone({
      now,
      startsAt: exam.startsAt,
      latestStartAt: latest,
      closedEarlyAt: exam.closedEarlyAt,
      anyInProgress,
    });
    const base: MyExamResultResponse = {
      lessonId,
      courseId: exam.courseId,
      courseTitle: exam.courseTitle,
      title: exam.title,
      status: finished ? AttemptStatus.FINISHED : AttemptStatus.IN_PROGRESS,
      startedAt: attempt.startedAt,
      finishedAt: attempt.finishedAt,
      finishedBy: attempt.finishedBy,
      released,
      closed,
      score: null,
      counts: null,
      standing: null,
      topics: [],
      courseTopics: [],
      questions: null,
    };
    if (!released) return base;

    const [questions, answers, topics, notes] = await Promise.all([
      this.questionsOf(exam.courseId, exam.examId),
      this.attempts.answersOf(attempt.id),
      this.repo.topicsOf(exam.courseId),
      // The talebe's own notes (soru notları).
      this.notes.mineByQuestion(user.sub, attempt.questionOrder),
    ]);
    const chosen = new Map(answers.map((a) => [a.questionId, a.optionIds]));
    const results = questionResults(questions.map(scored), chosen);
    const tallies = tallyByTopic(questions, results);
    const byId = new Map(questions.map((q) => [q.id, q]));
    const others = await this.othersOf(
      exam.examId,
      exam.durationMinutes,
      attempt.id,
      questions
    );
    const everyone = [
      { total: totalGot(results.values()), tallies },
      ...others,
    ];
    return {
      ...base,
      score:
        attempt.scoreHundredths === null
          ? null
          : pointsText(attempt.scoreHundredths),
      counts: countsOf(results.values()),
      standing: standingOf(
        everyone[0].total,
        everyone.map((p) => p.total)
      ),
      topics: [...tallies]
        .flatMap(([topicId, t]): MyTopicStandingResponse[] => {
          const topic = topics.get(topicId);
          return topic
            ? [
                {
                  topicId,
                  number: topic.number,
                  name: topic.name,
                  percent: percentOf(t.got, t.carried),
                  right: t.right,
                  wrong: t.wrong,
                  blank: t.blank,
                  standing: standingOf(
                    t.got,
                    everyone.map((p) => gotIn(p.tallies, topicId))
                  ),
                },
              ]
            : [];
        })
        .sort(weakestFirst),
      courseTopics: await this.courseStanding(user.sub, exam.courseId, topics),
      questions: closed
        ? attempt.questionOrder.flatMap((id, i) => {
            const q = byId.get(id);
            const r = results.get(id);
            if (!q || !r) return [];
            const picked = new Set(chosen.get(id) ?? []);
            const options = new Map(q.options.map((o) => [o.id, o]));
            return [
              {
                id,
                number: i + 1,
                text: q.text,
                outcome: r.outcome,
                points: fractionText(r.points),
                got: fractionText(r.got),
                options: (attempt.optionOrder[id] ?? []).flatMap((optionId) => {
                  const o = options.get(optionId);
                  return o
                    ? [
                        {
                          id: o.id,
                          text: o.text,
                          chosen: picked.has(o.id),
                          correct: o.correct,
                        },
                      ]
                    : [];
                }),
                talebeNotes: q.talebeNotes,
                myNote: noteOf(notes, id),
              },
            ];
          })
        : null,
    };
  }

  /**
   * Everyone else who took the exam, each as their exact points and their
   * points per topic, scored from their answers as the caller's are. Nothing
   * else of theirs is read, and none of it leaves the server.
   */
  private async othersOf(
    examId: string,
    durationMinutes: number,
    callerAttemptId: string,
    questions: IDraftQuestion[]
  ): Promise<Array<{ total: Fraction; tallies: Map<string, TopicTally> }>> {
    const ids = (
      await this.repo.participantsOf(examId, durationMinutes)
    ).filter((id) => id !== callerAttemptId);
    const answers = await this.repo.answersOfAttempts(ids);
    const chosen = new Map<string, Map<string, string[]>>(
      ids.map((id) => [id, new Map()])
    );
    for (const a of answers)
      chosen.get(a.attemptId)?.set(a.questionId, a.optionIds);
    const forScoring = questions.map(scored);
    return ids.map((id) => {
      const results = questionResults(forScoring, chosen.get(id) ?? new Map());
      return {
        total: totalGot(results.values()),
        tallies: tallyByTopic(questions, results),
      };
    });
  }

  private async questionsOf(
    courseId: string,
    examId: string
  ): Promise<IDraftQuestion[]> {
    const draft = await this.exams.findDraft(courseId, examId);
    return draft?.questions ?? [];
  }

  /** Each topic of the course over the caller's released exams of it, the weakest first. */
  private async courseStanding(
    userId: string,
    courseId: string,
    topics: Map<string, { number: number; name: string }>
  ): Promise<MyCourseTopicStandingResponse[]> {
    const taken = await this.repo.releasedAttemptsInCourse(userId, courseId);
    const perExam: Array<Map<string, TopicTally>> = [];
    for (const { examId, attemptId } of taken) {
      const [questions, answers] = await Promise.all([
        this.questionsOf(courseId, examId),
        this.attempts.answersOf(attemptId),
      ]);
      const results = questionResults(
        questions.map(scored),
        new Map(answers.map((a) => [a.questionId, a.optionIds]))
      );
      perExam.push(tallyByTopic(questions, results));
    }
    return [...courseTallies(perExam)]
      .flatMap(([topicId, t]): MyCourseTopicStandingResponse[] => {
        const topic = topics.get(topicId);
        return topic
          ? [
              {
                topicId,
                number: topic.number,
                name: topic.name,
                percent: percentOf(t.got, t.carried),
                exams: t.exams,
              },
            ]
          : [];
      })
      .sort(weakestFirst);
  }
}
