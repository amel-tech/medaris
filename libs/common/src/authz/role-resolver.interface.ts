import type { PermissionCode } from "./permissions";
import type { AnonymousRelation, Relation } from "./relations";
import type { ResourceRef } from "./scopes";

/**
 * A resource that is closed to everyone but the people above it: what keeps it
 * open, and the module's own 404 for the rest.
 */
export interface ResourceClosure {
  /** Holding any of these on the resource keeps it open (the başnazım always does). */
  openTo: readonly PermissionCode[];
  /** What a caller who may not open it is told: the same 404 as a missing resource. */
  notFound: Error;
}

/**
 * Contract for the live relationship layer.
 *
 * Implementations consult domain tables (enrollment, deck authorship, bans,
 * köşk visibility, …) to say what the caller is to a given resource: enrolled
 * in it, waiting to be, its author, or just any signed-in caller. The result
 * is a single relationship per `(userId, resource)` pair.
 *
 * The scoped roles (köşk nazımı, başmüderris, müderris, …) are NOT resolved
 * here. Since MDRS-135 they come from `role_assignments` and `permission_grants`
 * through the {@link AuthzContextLoader}, and a person may hold several of them
 * at once; a relationship adds to what they hold, it never replaces it.
 *
 * Returning `null` means "no relationship applies and none is intended", and
 * `AuthzService.can` treats it as a hard deny — there is no `PUBLIC` fallback.
 * A resolver must return `RELATIONS.PUBLIC` explicitly to open a resource to
 * any authenticated caller. A resource that is not there raises the module's
 * own 404 from inside the resolver, which the guard propagates untouched.
 *
 * Realm-level `SYSTEM_ADMIN` is NOT resolved here — it lives in the JWT's
 * `realm_access.roles` claim and is checked by `AuthzService` itself.
 */
export interface RoleResolver {
  resolve(
    userId: string,
    resource: ResourceRef
  ): Promise<Relation | null> | Relation | null;

  /**
   * Whether `resource` is closed (a course of a hidden köşk, MDRS-143), asked of
   * every signed-in caller by `AuthzGuard` in front of the permission decision,
   * so one rule closes every route on the resource, the ones added later too.
   * `null` when it is open. Read from the resource's own state, never from a
   * cascade, so what a hide closes a restore reopens with no column to keep in
   * step.
   *
   * Optional: a resolver with nothing to close answers nothing.
   */
  closure?(
    resource: ResourceRef
  ): Promise<ResourceClosure | null> | ResourceClosure | null;

  /**
   * Whether a caller with NO token may act on `resource` (MDRS-45). Consulted
   * only for handlers marked `@AuthzPublic()`, only when `request.user` is
   * absent.
   *
   * Return `RELATIONS.ANONYMOUS` to open the resource to the entity's
   * anonymous codes, `null` to refuse. Throwing a domain 404 works as it does
   * in `resolve` — that is how a private deck answers exactly like a missing
   * one.
   *
   * Optional, and fail-closed when absent: a resolver that has not thought
   * about anonymous callers refuses every one of them.
   */
  resolveAnonymous?(
    resource: ResourceRef
  ): Promise<AnonymousRelation | null> | AnonymousRelation | null;
}

/** DI token for the {@link RoleResolver} contract. Bind the concrete
 *  class once per app module. */
export const ROLE_RESOLVER = Symbol("ROLE_RESOLVER");
