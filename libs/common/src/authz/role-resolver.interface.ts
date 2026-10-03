import type { AnonymousRelation, Relation } from "./relations";
import type { ResourceRef } from "./scopes";

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
