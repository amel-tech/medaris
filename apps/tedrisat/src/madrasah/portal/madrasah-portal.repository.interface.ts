import type { EnrollmentStatus } from "../../course/domain/enrollment-status.enum";

/** A talebe's course in the medrese's list (nazir/10). */
export interface IStudentCourse {
  id: string;
  title: string;
  /** For a completed course; null while it is ongoing, or when the completion predates the date. */
  completedAt: Date | null;
}

/** One talebe of the medrese: who they are and what they attend or finished. */
export interface IMadrasahStudent {
  userId: string;
  name: string | null;
  email: string | null;
  /** The earliest enrollment in any of the medrese's courses, shown or not. */
  firstEnrolledAt: Date;
  ongoing: IStudentCourse[];
  completed: IStudentCourse[];
}

/** Narrows the medrese's talebe list; what is left out is not filtered on. */
export interface IMadrasahStudentFilter {
  /** Part of the name or the e-mail address. */
  q?: string;
  /** Attends or finished this course. */
  courseId?: string;
  /** Holds an enrollment in this state (in `courseId` when that is given). */
  status?: EnrollmentStatus.ENROLLED | EnrollmentStatus.COMPLETED;
}

export interface IMadrasahStudentPage {
  items: IMadrasahStudent[];
  total: number;
}

/** A live session of a medrese's course in the Pano's "Yaklaşan celseler". */
export interface IDashboardSession {
  lessonId: string;
  courseId: string;
  courseTitle: string;
  courseCoverHue: number;
  koskId: string;
  koskName: string;
  weekNumber: number;
  scheduledAt: Date;
  /** The host of the meeting link, or null when the session has none. */
  meetingHost: string | null;
}

/** A pending application in the Pano's "Bekleyen başvurular". */
export interface IDashboardApplication {
  courseId: string;
  courseTitle: string;
  koskId: string;
  userId: string;
  studentName: string | null;
  studentEmail: string | null;
  appliedAt: Date;
}

/** The courses and köşks where the caller decides applications, by role. */
export interface IDecidingScopes {
  courseIds: Set<string>;
  koskIds: Set<string>;
}
