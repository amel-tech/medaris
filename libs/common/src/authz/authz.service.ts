import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  AUTHZ_AUDIT,
  AUTHZ_CONTEXT,
  type AuthzAuditSink,
  type AuthzContextLoader,
} from "./authz-context.interface";
import { effectivePermissions, type IEffective } from "./effective-permissions";
import { AuthenticatedUser } from "./interfaces/authenticated-user.interface";
import {
  PERMISSION_META,
  PERMISSIONS,
  type PermissionCode,
} from "./permissions";
import { RELATIONS, relationCodes } from "./relations";
import { ROLE_RESOLVER, RoleResolver } from "./role-resolver.interface";
import { ENTITIES, ResourceRef, ROLES } from "./scopes";

const SYSTEM_ADMIN_REALM_ROLE = ROLES.SYSTEM_ADMIN;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Wanted = PermissionCode | readonly PermissionCode[];

const asList = (wanted: Wanted): readonly PermissionCode[] =>
  typeof wanted === "string" ? [wanted] : wanted;

/**
 * Ids are compared lower-cased everywhere. The database answers lower-case
 * uuids and a path may spell one in upper case (the route pipes and the
 * database both accept it), so the resource's own scope would otherwise drop
 * out of the caller's roles and grants and out of the passive-scope check.
 */
const normalized = (resource: ResourceRef): ResourceRef =>
  resource.id === resource.id.toLowerCase()
    ? resource
    : { ...resource, id: resource.id.toLowerCase() };

@Injectable()
export class AuthzService {
  constructor(
    @Inject(ROLE_RESOLVER) private readonly relations: RoleResolver,
    @Inject(AUTHZ_CONTEXT) private readonly loader: AuthzContextLoader,
    @Optional() @Inject(AUTHZ_AUDIT) private readonly audit?: AuthzAuditSink
  ) {}

  /**
   * Decide whether `user` holds `permission` on `resource`; with a list, any
   * one of them will do (a platform permission and the köşk's own, say).
   *
   * Algorithm:
   *   1. Realm-role bypass: `realm_access.roles` carrying SYSTEM_ADMIN allows
   *      everything, except what the başnazım may not do to another person's
   *      private deck (read it, audited, and nothing else).
   *   2. Ask the `RoleResolver` for the caller's relationship to the resource.
   *      `null` is a hard deny.
   *   3. Load the scope chain, the policies on it and what the caller holds in
   *      it, and compute the effective permissions once
   *      (`effectivePermissions`): relationship ∪ role defaults ∪ held grants,
   *      cut by policies and by a passive scope.
   *   4. Allow iff one of the wanted codes is in the result.
   *
   * Closed by default: a code nobody holds denies. Expiry and revocation are
   * decided in the loader's queries against `now()`, so a grant that ran out
   * is refused on the very next request, with no restart and no cache.
   *
   * `realm_access.roles` is read defensively: a protocol mapper that sends the
   * claim as a string instead of an array reads as empty (no bypass) rather
   * than throwing.
   */
  async can(
    user: AuthenticatedUser,
    rawResource: ResourceRef,
    permission: Wanted
  ): Promise<boolean> {
    const resource = normalized(rawResource);
    const wanted = asList(permission);
    if (this.isSystemAdmin(user)) return this.adminCan(user, resource, wanted);

    const relation = await this.relations.resolve(user.sub, resource);
    if (!relation) return false;

    const ctx = await this.loader.load(user.sub, resource);
    const effective = effectivePermissions(
      {
        entity: resource.entity,
        relation,
        chain: ctx.chain,
        madrasahCourse: ctx.madrasahCourse,
        passiveScope: ctx.passiveScope,
        policies: ctx.policies,
      },
      ctx.roles,
      ctx.grants
    );
    const granted = wanted.filter((code) => effective.codes.has(code));
    if (granted.length === 0) return false;

    // A passive scope is closed to everyone but platform management, and
    // every open of its content is on the record (nizam/14). A page view or
    // any other code that is no content opens nothing and writes nothing
    // (review L1: one page view wrote two rows).
    if (
      effective.openedPassive &&
      granted.some((code) => PERMISSION_META[code].content)
    ) {
      await this.record(user, resource, "scope.passive_open", {
        passiveScope: effective.openedPassive,
        permission: granted[0],
      });
    }
    return true;
  }

  /**
   * What the caller holds on a resource, for the screens and the tests: the
   * same computation `can` runs, without its audit rows.
   */
  async effective(
    user: AuthenticatedUser,
    rawResource: ResourceRef
  ): Promise<IEffective | null> {
    const resource = normalized(rawResource);
    const relation = await this.relations.resolve(user.sub, resource);
    if (!relation) return null;
    const ctx = await this.loader.load(user.sub, resource);
    return effectivePermissions(
      {
        entity: resource.entity,
        relation,
        chain: ctx.chain,
        madrasahCourse: ctx.madrasahCourse,
        passiveScope: ctx.passiveScope,
        policies: ctx.policies,
      },
      ctx.roles,
      ctx.grants
    );
  }

  /**
   * Decide whether a caller with NO token may hold `permission` on `resource`
   * (MDRS-45). `AuthzGuard` calls this only for an `@AuthzPublic()` handler.
   *
   * No realm-role bypass — there is no token to carry one. The resolver's
   * optional `resolveAnonymous` must answer `RELATIONS.ANONYMOUS`; a resolver
   * without it refuses every anonymous caller. Only the anonymous codes are
   * read, with no `PUBLIC` inheritance: PUBLIC means "authenticated".
   */
  async canAnonymous(
    rawResource: ResourceRef,
    permission: Wanted
  ): Promise<boolean> {
    const resource = normalized(rawResource);
    const relation = await this.relations.resolveAnonymous?.(resource);
    // Checked at runtime as well as in the type: a resolver written in plain
    // JS, or cast past the narrowing, must not hand an anonymous caller the
    // PUBLIC codes.
    if (relation !== RELATIONS.ANONYMOUS) return false;
    const open = relationCodes(resource.entity, RELATIONS.ANONYMOUS);
    return asList(permission).some((code) => open.includes(code));
  }

  /** Reports whether the caller holds the SYSTEM_ADMIN realm role.
   *  Exposed for service-layer code that needs the bypass outside the
   *  decision flow (e.g. multi-resource batch operations). */
  isSystemAdmin(user: AuthenticatedUser): boolean {
    const roles = user.realm_access?.roles;
    return Array.isArray(roles) && roles.includes(SYSTEM_ADMIN_REALM_ROLE);
  }

  /**
   * The başnazım's bypass, with the two things it does not do silently: it
   * reads another person's private deck and nothing else (writes stay refused,
   * MDRS-148), and opening a passive scope's content is audited like anyone's.
   * (A course's content read by someone who is not its talebe or müderris is
   * audited by `CourseService.present`, which knows what the read returned.)
   */
  private async adminCan(
    user: AuthenticatedUser,
    resource: ResourceRef,
    wanted: readonly PermissionCode[]
  ): Promise<boolean> {
    if (
      resource.entity === ENTITIES.FLASHCARD_DECK &&
      UUID_REGEX.test(resource.id)
    ) {
      const deck = await this.loader.findDeck(resource.id);
      if (deck && !deck.isPublic && deck.authorId !== user.sub) {
        if (!wanted.includes(PERMISSIONS.DECK_VIEW)) return false;
        await this.record(user, resource, "deck.admin_read", {
          authorId: deck.authorId,
        });
        return true;
      }
    }
    if (
      UUID_REGEX.test(resource.id) &&
      wanted.some((code) => PERMISSION_META[code].content)
    ) {
      const ctx = await this.loader.load(user.sub, resource);
      if (ctx.passiveScope) {
        await this.record(user, resource, "scope.passive_open", {
          passiveScope: ctx.passiveScope,
          permission: wanted[0],
        });
      }
    }
    return true;
  }

  private async record(
    user: AuthenticatedUser,
    resource: ResourceRef,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.audit?.record({
      actorId: user.sub,
      action,
      entity: resource.entity,
      entityId: resource.id,
      details,
    });
  }
}
