import {
  ASSIGNED_ROLES,
  type AssignedRole,
  SCOPE_TYPES,
  type ScopeType,
} from "../database/schema/role-assignment.schema";

/** The three kinds of scope nizam/14 lists. */
export const INACTIVE_SCOPE_TYPES = ["KOSK", "MADRASAH", "COURSE"] as const;
export type InactiveScopeType = (typeof INACTIVE_SCOPE_TYPES)[number];

/**
 * The role whose absence makes a scope passive, and the kind of scope it is
 * held in: the köşk's nazım, the medrese's başmüderris, the course's müderris
 * ("Son yöneticisi görevden alınan ya da görev süresi dolan").
 */
export const MANAGER_OF: Record<
  InactiveScopeType,
  { role: AssignedRole; scopeType: ScopeType }
> = {
  KOSK: { role: ASSIGNED_ROLES.KOSK_NAZIM, scopeType: SCOPE_TYPES.KOSK },
  MADRASAH: {
    role: ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
    scopeType: SCOPE_TYPES.MADRASAH,
  },
  COURSE: { role: ASSIGNED_ROLES.MUDERRIS, scopeType: SCOPE_TYPES.COURSE },
};

export type EndReason = "EXPIRED" | "REMOVED";

/**
 * Why the last manager's post ended: somebody took it away (`revokedAt` came
 * first or there was no end date), or its end date passed on its own. A post
 * revoked after it lapsed — the clean-up `grantRole` does — still lapsed.
 */
export function endReason(post: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): EndReason {
  if (post.revokedAt === null) return "EXPIRED";
  if (post.expiresAt !== null && post.expiresAt <= post.revokedAt) {
    return "EXPIRED";
  }
  return "REMOVED";
}

/** When the post ended: the earlier of the two dates, whichever exist. */
export function endedAt(post: {
  revokedAt: Date | null;
  expiresAt: Date | null;
}): Date | null {
  const dates = [post.revokedAt, post.expiresAt].filter(
    (d): d is Date => d !== null
  );
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}
