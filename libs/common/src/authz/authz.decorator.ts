import { SetMetadata } from "@nestjs/common";
import type { ModuleRef } from "@nestjs/core";
import type { AuthzRequest } from "./interfaces/authz-request.interface";
import type { PermissionCode } from "./permissions";
import { ResourceRef } from "./scopes";

/**
 * Resolver signature. Synchronous when the resource ID is sitting in
 * `req.params` / `req.body`; async when a DB lookup is required (e.g. a
 * card endpoint discovers its parent deck via `ModuleRef`).
 *
 * `ModuleRef` is injected by the guard so resolvers can reach
 * repositories without the controller having to thread them through.
 * Throwing `NotFoundException` (or any other `HttpException` /
 * `MedarisError`) from within the resolver propagates as-is — useful
 * for surfacing 404 on missing resources before the decision runs.
 */
export type AuthzResolve = (
  req: AuthzRequest,
  moduleRef: ModuleRef
) => ResourceRef | Promise<ResourceRef>;

/** Metadata attached by {@link Authz}. Consumed by `AuthzGuard`. */
export interface AuthzMeta {
  /** The catalogue code the route needs; with a list, any one of them will do. */
  permission: PermissionCode | readonly PermissionCode[];
  resolve: AuthzResolve;
}

export const AUTHZ_KEY = "authz";
export const AUTHZ_EXEMPT_KEY = "authz:exempt";

/**
 * Declare that a handler on an `AuthzGuard`-protected controller
 * deliberately carries no `@Authz` permission — a health probe, a listing that
 * is open to every authenticated caller.
 *
 * Needed because `@Authz` is per method while `@UseGuards(AuthGuard,
 * AuthzGuard)` is written once per class: a handler the author forgot to
 * annotate would otherwise be authenticated-only while the class reads as
 * authorized. `AuthzWiringAssertion` refuses to boot such a handler unless
 * it carries this marker, so opting out is a visible decision on the line.
 * The guard itself treats an exempt handler exactly like an unannotated one.
 */
export const AuthzExempt = (): MethodDecorator =>
  SetMetadata<string, true>(AUTHZ_EXEMPT_KEY, true);

export const AUTHZ_PUBLIC_KEY = "authz:public";

/**
 * Declare that a handler is reachable by a caller with NO token at all
 * (MDRS-45) — a public deck, a health probe, later the köşk and course
 * discovery pages (MDRS-122).
 *
 * Two walls come down, and this one marker opens both:
 *
 *  1. **Authentication.** `AuthGuard` lets a request with no
 *     `Authorization` header through on a handler carrying this marker,
 *     leaving `request.user` undefined. A header that IS present is verified
 *     exactly as before, so a malformed or expired token is still a 401 —
 *     an invalid token never degrades to anonymous.
 *  2. **Authorization.** With `@Authz` on the same handler, an anonymous
 *     caller is decided by `AuthzService.canAnonymous`: the resolver's
 *     `resolveAnonymous` must answer `RELATIONS.ANONYMOUS` for that resource,
 *     and the permission must be one of the entity's anonymous codes. An
 *     authenticated caller on the same handler is decided exactly as if the
 *     marker were absent. Without `@Authz`, the handler is open to anyone
 *     and does its own scoping — a list route, where there is no single
 *     resource to authorize.
 *
 * Per method on purpose, like `@Authz`: the controller keeps its one
 * class-level `@UseGuards(AuthGuard, AuthzGuard)`, so a handler added later
 * without this marker is closed, not open. `AuthzWiringAssertion` counts the
 * marker as a deliberate decision, and `AuthzGuard` honours it ahead of its
 * transitional no-metadata pass-through, so it keeps working when MDRS-44
 * flips that pass-through to deny.
 */
export const AuthzPublic = (): MethodDecorator =>
  SetMetadata<string, true>(AUTHZ_PUBLIC_KEY, true);

/**
 * Declare that a route requires the given catalogue `permission` (or any one
 * of a list) on a resource extracted from the request by `resolve`.
 *
 * The return type is narrowed to `MethodDecorator` deliberately: a
 * controller class typically carries handlers with different permissions,
 * so a single class-level rule is almost never what the author wants.
 * Forcing method placement at compile time prevents the footgun where
 * `@Authz(...)` silently has no effect because it was placed on the
 * class.
 *
 * @example
 *   @Patch('/courses/:id')
 *   @Authz(PERMISSIONS.COURSE_EDIT, byParam(ENTITIES.COURSE))
 *   updateCourse(...) { ... }
 *
 * @example
 *   // Creating a course is authorized against its parent kosk
 *   @Post('/courses')
 *   @Authz(PERMISSIONS.COURSE_OPEN_STANDALONE, byBody(ENTITIES.KOSK, 'koskId'))
 *   createCourse(...) { ... }
 *
 * @example
 *   // A card endpoint resolves its parent deck via DB lookup
 *   @Patch('/flashcard/cards/:id')
 *   @Authz(PERMISSIONS.DECK_MANAGE_CARDS, async (req, mod) => {
 *     const card = await mod.get(FlashcardRepository, { strict: false })
 *                            .findById(req.params.id, req.user.sub);
 *     if (!card) throw new NotFoundException(req.params.id);
 *     return { entity: ENTITIES.FLASHCARD_DECK, id: card.deckId };
 *   })
 *   updateCard(...) { ... }
 */
export const Authz = (
  permission: PermissionCode | readonly PermissionCode[],
  resolve: AuthzResolve
): MethodDecorator =>
  SetMetadata<string, AuthzMeta>(AUTHZ_KEY, { permission, resolve });
