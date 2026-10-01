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
}

export interface IKoskRepository {
  findAll(
    userId: string | null,
    limit: number,
    offset: number,
    filter?: IKoskListFilter
  ): Promise<IKoskWithStats[]>;
  count(filter?: IKoskListFilter): Promise<number>;
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
