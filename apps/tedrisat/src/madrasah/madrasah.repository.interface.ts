import type { CourseStatus } from "../course/domain/course-status.enum";

export interface IMadrasah {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  coverHue: number;
  createdBy: string;
  passiveSince: Date | null;
  passiveReason: string | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMadrasahWithNazirs extends IMadrasah {
  nazirIds: string[];
}

export interface IPaginatedMadrasahs {
  items: IMadrasahWithNazirs[];
  total: number;
  page: number;
  limit: number;
}

export interface ICreateMadrasah {
  handle: string;
  name: string;
  description?: string;
  coverHue?: number;
  createdBy: string;
}

export interface IUpdateMadrasah {
  handle?: string;
  name?: string;
  description?: string;
  coverHue?: number;
}

/** The müderris of a course as the medrese page lists them. */
export interface IMadrasahCourseMuderris {
  name: string;
  title: string | null;
  /** The course's imam among its müderrisler (MDRS-133). */
  isImam: boolean;
}

/**
 * One course of a medrese as its page lists it: the köşk it was opened in, the
 * caller's enrollment state and the next session. Carries no meeting link.
 */
export interface IMadrasahCourse {
  id: string;
  title: string;
  category: string | null;
  coverHue: number;
  koskId: string;
  koskName: string;
  muderris: IMadrasahCourseMuderris[];
  /** `null` for a caller with no token or no enrollment. */
  enrollmentStatus: "PENDING" | "ENROLLED" | "COMPLETED" | null;
  /** The earliest session still ahead, in any of the course's weeks. */
  nextSessionAt: Date | null;
}

export interface IMadrasahKoskRef {
  id: string;
  name: string;
}

/** One thing the outgoing başmüderris handed on and that is still held (nizam/22). */
export interface IHeadDelegation {
  kind: "ROLE" | "GRANT";
  id: string;
  userId: string;
  role: string | null;
  permission: string | null;
  groupName: string | null;
  grantedAt: Date;
  expiresAt: Date | null;
}

/** What the nazır portal's menu badges count for one medrese (MDRS-183). */
export interface IMadrasahBadgeCounts {
  /** PENDING enrollments across the medrese's courses. */
  pendingApplications: number;
  /** How many of those courses hold at least one of them. */
  coursesWithPendingApplications: number;
}

export interface IMadrasahHeadMuderris {
  id: string;
  /** From the `users` row; null until that person has signed in once. */
  name: string | null;
  /** How many of the medrese's courses they teach. */
  courseCount: number;
}

export interface IMadrasahOverview {
  headMuderris: IMadrasahHeadMuderris | null;
  courses: IMadrasahCourse[];
  kosks: IMadrasahKoskRef[];
}

/** The medrese's state, hidden first (MDRS-170). */
export type MadrasahStatus = "ACTIVE" | "PASSIVE" | "HIDDEN";
export type MadrasahStatusFilter = "ALL" | MadrasahStatus;

export interface IMadrasahDirectoryItem {
  id: string;
  handle: string;
  name: string;
  coverHue: number;
  status: MadrasahStatus;
  since: Date | null;
  headMuderris: { id: string; name: string | null } | null;
  courseCount: number;
  hostingKosks: { id: string; name: string }[];
}

export interface IMadrasahDirectoryFilter {
  status: MadrasahStatusFilter;
  q?: string;
}

export interface IMadrasahStatusCounts {
  all: number;
  active: number;
  passive: number;
  hidden: number;
}

export interface IPassiveMadrasah {
  id: string;
  name: string;
  since: Date;
}

export interface IMadrasahDirectory {
  items: IMadrasahDirectoryItem[];
  total: number;
  page: number;
  limit: number;
  counts: IMadrasahStatusCounts;
  passive: IPassiveMadrasah[];
}

/** What opening a medrese needs: the medrese and the person who heads it. */
export interface ICreateMadrasahWithHead extends ICreateMadrasah {
  headMuderrisUserId: string;
}

export type RestoreMadrasahResult = "restored" | "not-found" | "not-hidden";
export type HideMadrasahResult = "hidden" | "not-found" | "already-hidden";
/** A medrese as Keşfet lists it (MDRS-159). */
export interface IMadrasahExplore {
  id: string;
  handle: string;
  name: string;
  headMuderrisName: string | null;
  courseCount: number;
  courses: { id: string; title: string; coverHue: number }[];
}

/** Narrows the medrese list of Keşfet (MDRS-159). */
export interface IMadrasahExploreFilter {
  q?: string;
  level?: string;
  field?: string;
  madrasahId?: string;
}

/** The three medrese-level policies of nazir/04. */
export interface IMadrasahPolicies {
  closedCourseRequired: boolean;
  alwaysApproval: boolean;
  noPublicRecordings: boolean;
}

/** What the settings screen reads and saves (nazir/04). */
export interface IMadrasahSettings {
  name: string;
  description: string | null;
  policies: IMadrasahPolicies;
  /** The last save; null until the first one. */
  updatedAt: Date | null;
  updatedBy: { id: string; name: string | null; email: string | null } | null;
}

/** A partial save: what is left out is left as it is. `null` clears the description. */
export interface IUpdateMadrasahSettings {
  name?: string;
  description?: string | null;
  policies?: Partial<IMadrasahPolicies>;
}

/** A müderris of a course as the nazırs' course list shows them (nazir/07, nazir/17). */
export interface IMadrasahCourseListMuderris extends IMadrasahCourseMuderris {
  /** Null for a müderris shown by name alone, with no account behind them. */
  userId: string | null;
  /** From the `users` row; null until that person has signed in once. */
  email: string | null;
}

/**
 * A course of the medrese as the nazırs list it, drafts included: the settings
 * screen's (nazir/04) and the course list's (nazir/07).
 */
export interface IMadrasahCourseListItem {
  id: string;
  title: string;
  koskId: string;
  koskName: string;
  status: CourseStatus;
  requiresApproval: boolean;
  closed: boolean;
  createdAt: Date;
  /** Enrolled talebe; pending applications and completions are not counted. */
  studentCount: number;
  pendingCount: number;
  muderris: IMadrasahCourseListMuderris[];
}

/** Narrows the nazırs' course list; what is left out is not filtered on. */
export interface IMadrasahCourseFilter {
  koskId?: string;
  status?: CourseStatus;
  /** One course, for the answer to a write on it. */
  courseId?: string;
}
