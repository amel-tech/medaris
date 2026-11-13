/**
 * An exam (MDRS-248, "Ara sınav"): a celse of the course planned as "Sınav".
 * The celse itself stays a LIVE session, so it sits in the programme, the
 * calendar, Programım, the invitations and the reminders like any other; its
 * row in `lesson_exams` is what makes it an exam and holds what only an exam
 * has. A make-up ("Telafi") is a second exam celse of the same course with
 * `isRetake`, and its results are a column of their own.
 */
export enum ExamFormat {
  /** "Yazılı" */
  WRITTEN = "WRITTEN",
  /** "Şifahi" */
  ORAL = "ORAL",
}

/** "Tam puan" when the müderris types none. */
export const EXAM_DEFAULT_MAX_SCORE = 100;
/** The highest "tam puan" an exam may have. */
export const EXAM_MAX_SCORE_LIMIT = 1000;
/** The longest "Konular", in characters. */
export const EXAM_TOPICS_MAX = 2000;
/** The longest in-person place ("Yer"), in characters. */
export const EXAM_LOCATION_MAX = 200;

/** What makes a celse an exam, as the course detail and the session page carry it. */
export interface ILessonExam {
  format: ExamFormat;
  maxScore: number;
  /** "Konular": plain text as typed; null when none. */
  topics: string | null;
  /** Where it is held in person; null when it is held online. */
  location: string | null;
  /** "Telafi": a make-up of an earlier exam of the course. */
  isRetake: boolean;
  /** When the course team opened the results to the talebe; null while closed. */
  resultsReleasedAt: Date | null;
}

/** A score is a whole number from 0 to the exam's `maxScore`. */
export const isScoreInRange = (score: number, maxScore: number): boolean =>
  Number.isInteger(score) && score >= 0 && score <= maxScore;
