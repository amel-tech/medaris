import { ResourceRef, Role } from "./scopes";

/**
 * Contract for the live role-resolution layer.
 *
 * Implementations consult domain tables (enrollment, ownership, kosk
 * membership, …) to decide which role the caller holds on a given
 * resource. The result is a single role per `(userId, resource)` pair;
 * when a user holds multiple potential roles (e.g. both KOSK_MANAGER of
 * a kosk and MUDERRIS of a course inside it), the implementation
 * chooses the most permissive — see the priority rules documented next
 * to each implementation.
 *
 * Returning `null` means "no specific role applies", and
 * `AuthzService.can` treats that as a hard deny — there is no `PUBLIC`
 * fallback. A resolver must return `ROLES.PUBLIC` explicitly to open a
 * resource to any authenticated caller.
 *
 * Realm-level `SYSTEM_ADMIN` is NOT resolved here — it lives in the
 * JWT's `realm_access.roles` claim and is checked by `AuthzService`
 * itself, since it does not require a DB lookup.
 */
export interface RoleResolver {
  resolve(
    userId: string,
    resource: ResourceRef
  ): Promise<Role | null> | Role | null;
}

/** DI token for the {@link RoleResolver} contract. Bind the concrete
 *  class once per app module. */
export const ROLE_RESOLVER = Symbol("ROLE_RESOLVER");
