/**
 * "Sınavlarım" in tedris (MDRS-299): where each exam of a talebe's courses
 * stands for them, of every format (the owner, 21 Nov 2026: the list holds
 * every exam of the talebe's courses, whatever its format). The contract is
 * `listMyExams` of `graphs/domain/planned-exams.yaml`; the screen is
 * `graphs/tedris/exams/mine`.
 *
 * Everything here is pure.
 */
import { ExamWindow, examWindow, secondsLeft } from "./exam-attempt";

/** The exam's format as Sınavlarım names it: the lesson exam's two, and the online one. */
export enum MyExamFormat {
  WRITTEN = "WRITTEN",
  ORAL = "ORAL",
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
}

/**
 * Where an exam stands for the talebe: to come, open to start, in progress,
 * taken (its result not released), missed, or its result released.
 */
export enum MyExamState {
  UPCOMING = "UPCOMING",
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  TAKEN = "TAKEN",
  MISSED = "MISSED",
  RELEASED = "RELEASED",
}

/** The open and coming exams first, then the past ones. */
export const isPast = (state: MyExamState): boolean =>
  state === MyExamState.TAKEN ||
  state === MyExamState.MISSED ||
  state === MyExamState.RELEASED;

/** A talebe's attempt as far as its standing goes. */
export interface AttemptStanding {
  finishedAt: Date | null;
  usedSeconds: number;
}

/**
 * Whether an attempt is over: finished, or due to be finished on its next
 * read because the team closed the exam early or its time is used up.
 */
export const attemptIsOver = (
  attempt: AttemptStanding,
  exam: { durationMinutes: number; closedEarlyAt: Date | null },
  now: Date
): boolean =>
  attempt.finishedAt !== null ||
  (exam.closedEarlyAt !== null &&
    exam.closedEarlyAt.getTime() <= now.getTime()) ||
  secondsLeft(exam.durationMinutes, attempt.usedSeconds) === 0;

/** An online exam's standing for the talebe. */
export const onlineExamState = (input: {
  now: Date;
  startsAt: Date;
  latestStartAt: Date;
  closedEarlyAt: Date | null;
  durationMinutes: number;
  attempt: AttemptStanding | null;
  released: boolean;
}): MyExamState => {
  const { attempt } = input;
  if (attempt) {
    if (!attemptIsOver(attempt, input, input.now))
      return MyExamState.IN_PROGRESS;
    return input.released ? MyExamState.RELEASED : MyExamState.TAKEN;
  }
  const window = examWindow(
    input.now,
    input.startsAt,
    input.latestStartAt,
    input.closedEarlyAt
  );
  if (window === ExamWindow.BEFORE) return MyExamState.UPCOMING;
  if (window === ExamWindow.OPEN) return MyExamState.OPEN;
  return MyExamState.MISSED;
};

/**
 * A written or oral exam's standing: to come before its celse; after it, the
 * result once released ("Girmedi" is missed), and taken until then.
 */
export const lessonExamState = (input: {
  now: Date;
  startsAt: Date;
  released: boolean;
  absent: boolean | null;
}): MyExamState => {
  if (input.now.getTime() < input.startsAt.getTime())
    return MyExamState.UPCOMING;
  if (!input.released) return MyExamState.TAKEN;
  return input.absent === true ? MyExamState.MISSED : MyExamState.RELEASED;
};

/**
 * Whether an online exam has closed for everyone, so its answers may be read
 * with the correct ones: closed early, or past its latest start with no
 * attempt still in progress.
 */
export const closedForEveryone = (input: {
  now: Date;
  startsAt: Date;
  latestStartAt: Date;
  closedEarlyAt: Date | null;
  anyInProgress: boolean;
}): boolean => {
  if (
    input.closedEarlyAt !== null &&
    input.closedEarlyAt.getTime() <= input.now.getTime()
  ) {
    return true;
  }
  return (
    examWindow(
      input.now,
      input.startsAt,
      input.latestStartAt,
      input.closedEarlyAt
    ) === ExamWindow.CLOSED && !input.anyInProgress
  );
};
