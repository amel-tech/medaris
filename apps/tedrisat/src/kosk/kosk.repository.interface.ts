import type { IPurgeCounts } from "../course/course-purge";

export interface IKosk {
  id: string;
  ownerId: string;
  name: string;
  handle: string | null;
  description: string | null;
  coverHue: number;
  isPrivate: boolean;
  field: string | null;
  level: string | null;
  tags: string[];
  verified: boolean;
  featured: boolean;
  rating: number;
  ratingCount: number;
  passiveSince: Date | null;
  passiveReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKoskWithStats extends IKosk {
  /** Who manages the köşk (MDRS-126), oldest first; never empty. */
  managerIds: string[];
  /** The oldest manager's name, for the köşk's page (MDRS-160); null when none is on file. */
  managerName: string | null;
  courseCount: number;
  studentCount: number;
  muderrisCount: number;
  followerCount: number;
  isFollowing: boolean;
}

export interface IPaginatedKosks {
  items: IKoskWithStats[];
  total: number;
  page: number;
  limit: number;
}

export interface ICreateKosk {
  ownerId: string;
  name: string;
  handle?: string | null;
  description?: string | null;
  coverHue?: number;
  isPrivate?: boolean;
  field?: string | null;
  level?: string | null;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  rating?: number;
  ratingCount?: number;
}

export interface IUpdateKosk {
  name?: string;
  handle?: string | null;
  description?: string | null;
  coverHue?: number;
  isPrivate?: boolean;
  field?: string | null;
  level?: string | null;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  rating?: number;
  ratingCount?: number;
}

/**
 * Who is changing a köşk's managers (MDRS-126). `bypass` is SYSTEM_ADMIN,
 * who may do so without being a manager.
 */
export interface IManagerActor {
  id: string;
  bypass: boolean;
}

/**
 * What adding a manager came to (MDRS-126). `forbidden` — the actor was no
 * longer a manager by the time the köşk was locked; `unknown-user` — no
 * `users` row, i.e. that person has never signed in.
 */
export type AddManagerOutcome =
  | "added"
  | "no-kosk"
  | "forbidden"
  | "unknown-user";

/**
 * What removing a manager came to (MDRS-126). `last` — the user is the köşk's
 * only manager and stays; `not-manager` — the user was not one to begin with.
 */
export type RemoveManagerOutcome =
  | "removed"
  | "no-kosk"
  | "forbidden"
  | "last"
  | "not-manager";

/** A köşk as it appears in a caller's role summary (`GET /me`, MDRS-104). */
export interface IKoskRef {
  id: string;
  name: string;
}

/**
 * Narrows a köşk listing. `managerId` (MDRS-108) keeps only the köşks that
 * user manages, unlisted ones included — it is the manager's own list.
 * Without it the listing is the public one, and an unlisted (`is_private`)
 * köşk is never in it (MDRS-122). `madrasahId` keeps the köşks that medrese
 * holds a hosting right in (MDRS-134) — the medrese page's shelf (MDRS-122).
 */
export interface IKoskListFilter {
  managerId?: string;
  madrasahId?: string;
  /** Exactly this `kosks.level` (MDRS-159). */
  level?: string;
  /** Exactly this `kosks.field`, the ilim alanı (MDRS-159). */
  field?: string;
  /** Words of the name, handle, description or field, case-insensitive (MDRS-159). */
  q?: string;
}

/** A deck the köşk offers its talebe (MDRS-159). */
export interface IKoskDeck {
  id: string;
  title: string;
  cardCount: number;
  /** Whether the caller already has the deck in their collection. */
  inCollection: boolean;
}

/** What the köşk page's deck block shows the caller (MDRS-159). */
export interface IKoskDecks {
  /** False for a caller who is neither a talebe, müderris nor manager of the köşk. */
  accessible: boolean;
  decks: IKoskDeck[];
}

/** A course of a köşk the caller follows (MDRS-165). */
export interface IFollowedKoskCourse {
  id: string;
  title: string;
  koskId: string;
  koskName: string;
  coverHue: number;
  muderrisName: string | null;
  muderrisIsImam: boolean;
}

export interface IKoskRepository {
  findAll(
    userId: string | null,
    limit: number,
    offset: number,
    filter?: IKoskListFilter
  ): Promise<IKoskWithStats[]>;
  count(filter?: IKoskListFilter): Promise<number>;
  /** The distinct ilim alanı of the listed köşks, alphabetical. */
  listFields(): Promise<string[]>;
  findDecks(koskId: string, userId: string): Promise<IKoskDecks>;
  findFollowedCourses(
    userId: string,
    limit: number
  ): Promise<IFollowedKoskCourse[]>;
  /** `userId` null is a caller with no token (MDRS-122): following nothing. */
  findById(id: string, userId: string | null): Promise<IKoskWithStats | null>;
  exists(id: string): Promise<boolean>;
  /** Whether the köşk is unlisted, or null when there is no such köşk. */
  findVisibility(id: string): Promise<{ isPrivate: boolean } | null>;
  isManager(koskId: string, userId: string): Promise<boolean>;
  findManagedBy(userId: string): Promise<IKoskRef[]>;
  managesAny(userId: string): Promise<boolean>;
  /** Creates the köşk with its creator (`ownerId`) as its first manager. */
  create(kosk: ICreateKosk): Promise<IKosk>;
  /** Idempotent: adding a manager twice leaves one row. */
  addManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<AddManagerOutcome>;
  removeManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<RemoveManagerOutcome>;
  update(id: string, updates: IUpdateKosk): Promise<IKosk | null>;
  /** SYSTEM_ADMIN's delete: the köşk, its courses, their children, an audit entry. */
  purge(
    id: string,
    actorId: string
  ): Promise<(IPurgeCounts & { followers: number }) | null>;
  follow(userId: string, koskId: string): Promise<boolean>;
  unfollow(userId: string, koskId: string): Promise<boolean>;
}
