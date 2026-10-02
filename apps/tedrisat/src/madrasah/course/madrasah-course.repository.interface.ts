/** A köşk the medrese holds a hosting right in (nazir/07's side block, nazir/08's choice). */
export interface IMadrasahHostingKosk {
  id: string;
  name: string;
  /** The köşk's ilim alanı. */
  field: string | null;
  /** The medrese's courses in it that are not hidden, drafts included. */
  courseCount: number;
}

/** A müderris of a course being written: the account, and the name a new row carries. */
export interface ICourseMuderrisInput {
  userId: string;
  /** Left out for an account that stays on a course already listing it. */
  name?: string;
}

/** What opening a course for a medrese writes (nazir/08). */
export interface IOpenMadrasahCourse {
  madrasahId: string;
  koskId: string;
  title: string;
  requiresApproval: boolean;
  closed: boolean;
  /** In list order. */
  muderris: ICourseMuderrisInput[];
  imamUserId: string;
  actorId: string;
}

export type OpenMadrasahCourseResult =
  | { status: "opened"; courseId: string }
  | { status: "madrasah-not-found" }
  | { status: "no-hosting-right" };

/** What replacing a course's müderrisler writes (nazir/17). */
export interface ISetCourseMuderris {
  madrasahId: string;
  courseId: string;
  /** In list order. A müderris who stays keeps the row they have. */
  muderris: ICourseMuderrisInput[];
  imamUserId: string;
  actorId: string;
}

export type HideMadrasahCourseResult =
  | "hidden"
  | "not-found"
  | "already-hidden";
