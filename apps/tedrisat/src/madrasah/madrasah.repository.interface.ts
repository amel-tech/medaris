export interface IMadrasah {
  id: string;
  handle: string;
  name: string;
  description: string | null;
  coverHue: number;
  createdBy: string;
  passiveSince: Date | null;
  passiveReason: string | null;
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
