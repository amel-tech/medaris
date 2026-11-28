import { latestStartOf } from "../../online-exam/domain/exam-attempt";
import { closedForEveryone } from "../../online-exam/domain/my-exams";
import { ExamKind } from "../../online-exam/domain/online-exam";

/** Longest note, and longest answer, in characters after trimming. */
export const QUESTION_NOTE_BODY_MAX = 1000;

/** A note as it is stored (MDRS-248, soru notları). */
export interface IQuestionNote {
  id: string;
  courseId: string;
  examId: string;
  questionId: string;
  userId: string;
  body: string;
  sharedWithTeacher: boolean;
  sharedAt: Date | null;
  teacherReply: string | null;
  repliedBy: string | null;
  repliedAt: Date | null;
  replySeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A note as its talebe reads it, beside its question or in their list. */
export interface IMyQuestionNote {
  id: string;
  body: string;
  sharedWithTeacher: boolean;
  sharedAt: Date | null;
  teacherReply: string | null;
  repliedAt: Date | null;
  newReply: boolean;
  updatedAt: Date;
}

/**
 * Whether the hoca's answer is one the talebe has not read yet: there is an
 * answer, and the talebe's list was not read since it was written.
 */
export const hasNewReply = (
  note: Pick<IQuestionNote, "repliedAt" | "replySeenAt">
): boolean =>
  note.repliedAt !== null &&
  (note.replySeenAt === null ||
    note.replySeenAt.getTime() < note.repliedAt.getTime());

/** Whether the talebe wrote the note again after the hoca answered it. */
export const editedAfterReply = (
  note: Pick<IQuestionNote, "repliedAt" | "updatedAt">
): boolean =>
  note.repliedAt !== null &&
  note.updatedAt.getTime() > note.repliedAt.getTime();

/** The note as its own talebe reads it: nothing of the question's answer. */
export const presentMine = (note: IQuestionNote): IMyQuestionNote => ({
  id: note.id,
  body: note.body,
  sharedWithTeacher: note.sharedWithTeacher,
  sharedAt: note.sharedAt,
  teacherReply: note.teacherReply,
  repliedAt: note.repliedAt,
  newReply: hasNewReply(note),
  updatedAt: note.updatedAt,
});

/** The talebe's own note on the question, as they read it; null when there is none. */
export const noteOf = (
  notes: ReadonlyMap<string, IQuestionNote>,
  questionId: string
): IMyQuestionNote | null => {
  const note = notes.get(questionId);
  return note ? presentMine(note) : null;
};

/** What decides whether a note on a question may be sent to the hoca now. */
export interface IShareWindow {
  kind: ExamKind;
  now: Date;
  /** The exam's celse start; null for a çalışma seti or a draft. */
  startsAt: Date | null;
  latestStartAt: Date | null;
  closedEarlyAt: Date | null;
  /** Whether any talebe's sitting of the exam still runs. */
  anyInProgress: boolean;
  /** When Değerlendirme opened the exam's results to the talebe; null until then. */
  releasedAt: Date | null;
}

/**
 * Whether a note may be sent to the hoca now. A çalışma seti's always may;
 * an exam's only once the exam is over for everyone (closed early, or past
 * its latest start with no sitting still running) or its results are open,
 * so that a note is never a channel to the hoca while talebe still sit it.
 */
export const shareOpen = (w: IShareWindow): boolean => {
  if (w.kind === ExamKind.PRACTICE) return true;
  if (w.releasedAt !== null) return true;
  if (w.startsAt === null) return false;
  return closedForEveryone({
    now: w.now,
    startsAt: w.startsAt,
    latestStartAt: latestStartOf(w.startsAt, w.latestStartAt),
    closedEarlyAt: w.closedEarlyAt,
    anyInProgress: w.anyInProgress,
  });
};

/** A note as the hoca's list orders it. */
export interface ITeacherOrdered {
  teacherReply: string | null;
  sharedAt: Date | null;
  repliedAt: Date | null;
}

/**
 * The hoca's order: the notes waiting for an answer first, the longest
 * waiting first; then the answered ones, the latest answered first.
 */
export const teacherOrder = (
  a: ITeacherOrdered,
  b: ITeacherOrdered
): number => {
  const aWaits = a.teacherReply === null;
  const bWaits = b.teacherReply === null;
  if (aWaits !== bWaits) return aWaits ? -1 : 1;
  if (aWaits) {
    return (a.sharedAt?.getTime() ?? 0) - (b.sharedAt?.getTime() ?? 0);
  }
  return (b.repliedAt?.getTime() ?? 0) - (a.repliedAt?.getTime() ?? 0);
};
