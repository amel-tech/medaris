import {
  type AuthenticatedUser,
  AuthzService,
  ENTITIES,
  type IAuthzFacts,
  type IHeldGrantCodes,
  type IHeldRole,
  type PermissionCode,
  RELATIONS,
  rolesConferring,
  SCOPE_TYPES,
  type ScopeRef,
} from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { BAN_SCOPES, type BanScope } from "../database/schema/ban.schema";
import {
  type BanRole,
  type BanTier,
  highestRole,
  SYSTEM_ADMIN_ROLE,
  tierOfRole,
} from "./ban-tier";

/**
 * Where a ban sits, or would sit: the course (with its köşk and, for a medrese
 * course, its medrese), a köşk, a medrese, or the platform. It is what the
 * permission is asked on, since a holding reaches only the places below the
 * scope it is held at.
 */
export type IBanPlace =
  | {
      kind: typeof BAN_SCOPES.COURSE;
      courseId: string;
      koskId: string;
      madrasahId: string | null;
    }
  | { kind: typeof BAN_SCOPES.KOSK; koskId: string }
  | { kind: typeof BAN_SCOPES.MADRASAH; madrasahId: string }
  | { kind: "PLATFORM" };

export const coursePlace = (course: {
  id: string;
  koskId: string;
  madrasahId: string | null;
}): IBanPlace => ({
  kind: BAN_SCOPES.COURSE,
  courseId: course.id,
  koskId: course.koskId,
  madrasahId: course.madrasahId,
});
export const koskPlace = (koskId: string): IBanPlace => ({
  kind: BAN_SCOPES.KOSK,
  koskId,
});
export const madrasahPlace = (madrasahId: string): IBanPlace => ({
  kind: BAN_SCOPES.MADRASAH,
  madrasahId,
});
export const PLATFORM_PLACE: IBanPlace = { kind: "PLATFORM" };

/**
 * Where an existing ban sits: its course, its köşk or its medrese, by its
 * scope. `madrasahId` is the medrese a course ban's course belongs to, or the
 * medrese of a medrese-wide ban.
 */
export function placeOfBan(
  ban: {
    scope: BanScope;
    koskId: string | null;
    courseId: string | null;
  },
  madrasahId: string | null
): IBanPlace | null {
  if (ban.scope === BAN_SCOPES.COURSE) {
    return ban.courseId && ban.koskId
      ? coursePlace({
          id: ban.courseId,
          koskId: ban.koskId,
          madrasahId,
        })
      : null;
  }
  if (ban.scope === BAN_SCOPES.KOSK) {
    return ban.koskId ? koskPlace(ban.koskId) : null;
  }
  return madrasahId ? madrasahPlace(madrasahId) : null;
}

/** What one caller holds, read once for a decision or for a whole list. */
export interface IBanHoldings {
  /** The başnazım: the realm role bypasses the catalogue, as `AuthzService.can` does. */
  admin: boolean;
  roles: IHeldRole[];
  grants: IHeldGrantCodes[];
}

/** The caller's standing for one permission: the highest role that confers it. */
export interface IBanStanding {
  role: BanRole;
  tier: BanTier;
}

const PLATFORM: ScopeRef = { type: SCOPE_TYPES.PLATFORM, id: null };

/** The scopes the place sits in, narrowest first, as the engine's loader builds them. */
function factsOf(place: IBanPlace): IAuthzFacts {
  const base = {
    relation: RELATIONS.PUBLIC,
    passiveScope: null,
    policies: [],
  };
  switch (place.kind) {
    case BAN_SCOPES.COURSE:
      return {
        ...base,
        entity: ENTITIES.COURSE,
        madrasahCourse: place.madrasahId !== null,
        chain: [
          { type: SCOPE_TYPES.COURSE, id: place.courseId },
          ...(place.madrasahId
            ? [{ type: SCOPE_TYPES.MADRASAH, id: place.madrasahId }]
            : []),
          { type: SCOPE_TYPES.KOSK, id: place.koskId },
          PLATFORM,
        ],
      };
    case BAN_SCOPES.KOSK:
      return {
        ...base,
        entity: ENTITIES.KOSK,
        madrasahCourse: false,
        chain: [{ type: SCOPE_TYPES.KOSK, id: place.koskId }, PLATFORM],
      };
    case BAN_SCOPES.MADRASAH:
      return {
        ...base,
        entity: ENTITIES.MADRASAH,
        madrasahCourse: false,
        chain: [{ type: SCOPE_TYPES.MADRASAH, id: place.madrasahId }, PLATFORM],
      };
    default:
      return {
        ...base,
        entity: ENTITIES.KOSK,
        madrasahCourse: false,
        chain: [PLATFORM],
      };
  }
}

/**
 * Who may do what about bans, decided from the permission catalogue (MDRS-205)
 * instead of from the roles held. `ban-codes.ts` says which permission each
 * action asks; this class asks the engine's own computation
 * (`effectivePermissions`, through `rolesConferring`) on the place the ban sits,
 * over what the caller holds, and answers with the caller's STANDING: the
 * highest-ranked role that confers the permission. That rank is the tier the
 * kademe rule orders by, so a role with no power of its own (a medrese nazırı
 * with no grant) never raises the standing of one that has.
 *
 * The caller's holdings are read once (two queries) and every place is decided
 * in memory, so a list of bans, each in its own course, costs no more than one
 * ban. The başnazım, a realm role with no row, bypasses the catalogue as it
 * does everywhere else.
 */
@Injectable()
export class BanAuthority {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly authz: AuthzService,
    private readonly context: TedrisatAuthzContext
  ) {}

  async holdingsOf(user: AuthenticatedUser): Promise<IBanHoldings> {
    if (this.authz.isSystemAdmin(user)) {
      return { admin: true, roles: [], grants: [] };
    }
    return { admin: false, ...(await this.context.holdings(user.sub)) };
  }

  /** The caller's standing for any of `wanted` at `place`, or null when they hold none. */
  standing(
    held: IBanHoldings,
    place: IBanPlace,
    wanted: readonly PermissionCode[]
  ): IBanStanding | null {
    if (held.admin) {
      return { role: SYSTEM_ADMIN_ROLE, tier: tierOfRole(SYSTEM_ADMIN_ROLE) };
    }
    const roles = rolesConferring(
      factsOf(place),
      held.roles,
      held.grants,
      wanted
    );
    const role = highestRole(roles.map((r) => ({ role: r })));
    return role ? { role, tier: tierOfRole(role) } : null;
  }
}
