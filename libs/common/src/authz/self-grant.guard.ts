import { Inject, Injectable, Optional } from "@nestjs/common";
import { type AssignedRole } from "./assignments";
import { AuthzService } from "./authz.service";
import { AUTHZ_AUDIT, type AuthzAuditSink } from "./authz-context.interface";
import { SelfGrantRefusedError } from "./exceptions/exceptions";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import { type PermissionCode, ROLE_DEFAULT_PERMISSIONS } from "./permissions";
import { ResourceRef } from "./scopes";

/** What a caller is about to name themselves into. */
export interface ISelfGrantWhat {
  /**
   * The role being given. Its defaults are the codes the person would hold,
   * the caller's own holdings are checked against them.
   */
  role?: AssignedRole;
  /** Codes being given on their own (a grant, a group's codes). */
  codes?: readonly PermissionCode[];
  /**
   * Refuse whatever the caller holds: for the paths where naming oneself has no
   * honest use (a nazır appointing themselves, a Medaris nazımı seating
   * themselves as a köşk's nazımı), so the answer does not hang on the sums.
   */
  always?: boolean;
}

/**
 * No one names themselves into more than they hold (MDRS-135, review B1/M4).
 *
 * The ceiling rule says a granter gives at most what their own role default
 * covers, and grantees never hand on what they were given. A path that lets the
 * caller be the one it names gets around both: the Medaris nazımı with one
 * platform permission appoints themselves the nazır of a medrese and gives
 * themselves every medrese and course permission; a köşk nazımı seats
 * themselves as a ders nazırı and the seat outlives their own dismissal.
 *
 * SYSTEM_ADMIN is not asked. Everyone else may name themselves only into what
 * they already hold in the scope: a başmüderris who teaches a course of their
 * own medrese names themselves müderris (they hold every course code there),
 * a Medaris nazımı does not. A refusal is written to the audit log, so the
 * attempt is on record even though nothing changed.
 */
@Injectable()
export class SelfGrantGuard {
  constructor(
    private readonly authz: AuthzService,
    @Optional() @Inject(AUTHZ_AUDIT) private readonly audit?: AuthzAuditSink
  ) {}

  async assertNotSelf(
    user: AuthenticatedUser,
    targetUserIds: readonly string[],
    resource: ResourceRef,
    what: ISelfGrantWhat,
    action: string
  ): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;
    const me = user.sub.toLowerCase();
    if (!targetUserIds.some((id) => id.toLowerCase() === me)) return;

    const wanted = new Set<PermissionCode>([
      ...(what.codes ?? []),
      ...(what.role ? ROLE_DEFAULT_PERMISSIONS[what.role] : []),
    ]);
    if (!what.always) {
      const held = (await this.authz.effective(user, resource))?.codes;
      if (held && [...wanted].every((code) => held.has(code))) return;
    }
    await this.audit?.record({
      actorId: user.sub,
      action: "permission.self_grant_refused",
      entity: resource.entity,
      entityId: resource.id,
      details: {
        route: action,
        role: what.role ?? null,
        codes: [...wanted].sort(),
      },
    });
    throw new SelfGrantRefusedError({
      action,
      entity: resource.entity,
      resourceId: resource.id,
    });
  }
}
