import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import { MedarisError } from "../error/errors/base/medaris.error";
import { AUTHZ_KEY, AUTHZ_PUBLIC_KEY, AuthzMeta } from "./authz.decorator";
import { AuthzService } from "./authz.service";
import {
  AuthzForbiddenError,
  AuthzMissingUserError,
  AuthzResolverError,
} from "./exceptions/exceptions";
import { AuthzRequest } from "./interfaces/authz-request.interface";
import { ResourceRef } from "./scopes";

/**
 * Enforces the `@Authz` contract on a route. Must be wired *after*
 * `AuthGuard` so `request.user` is set:
 *
 *   @UseGuards(AuthGuard, AuthzGuard)
 *   @Authz(PERMISSIONS.COURSE_EDIT, byParam(ENTITIES.COURSE))
 *   update(...) { ... }
 *
 * NestJS evaluates `@UseGuards` guards in declaration order, so
 * AuthGuard runs first, populates `request.user`, then AuthzGuard reads
 * the metadata and decides allow/deny.
 *
 * **Anonymous callers (MDRS-45).** On a handler marked `@AuthzPublic()`,
 * `AuthGuard` lets a request with no token through with `request.user`
 * unset. Without `@Authz` such a handler is open and passes here; with it,
 * the anonymous caller is decided by `AuthzService.canAnonymous` and refused
 * with a 401 — signing in is what would change the answer. On every other
 * handler a missing user is still `AuthzMissingUserError`.
 *
 * **Permissive fall-through (deliberate, transitional).** Routes
 * without `@Authz` metadata pass through unchanged. Once all in-scope
 * endpoints are annotated, MDRS-44 flips this to deny-by-default. The
 * `@AuthzPublic` pass is its own branch, ahead of that one, so the flip
 * does not close it.
 */
@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthzService,
    private readonly moduleRef: ModuleRef
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const handler = ctx.getHandler();
    const meta = this.reflector.get<AuthzMeta | undefined>(AUTHZ_KEY, handler);
    const isPublic =
      this.reflector.get<true | undefined>(AUTHZ_PUBLIC_KEY, handler) === true;

    // Two branches that answer the same today, kept apart on purpose: the
    // first is the `@AuthzPublic` decision and stays; the second is the
    // transitional pass-through MDRS-44 turns into a deny.
    if (!meta && isPublic) return true;
    if (!meta) return true;

    const request = ctx.switchToHttp().getRequest<AuthzRequest>();
    const user = request.user;
    if (!user) {
      if (!isPublic) {
        throw new AuthzMissingUserError();
      }
      const resource = await this.resolveResource(meta, request);
      if (!(await this.authz.canAnonymous(resource, meta.permission))) {
        throw new AuthzMissingUserError(
          "Sign in to perform this action on this resource",
          {
            entity: resource.entity,
            resourceId: resource.id,
            permission: meta.permission,
          }
        );
      }
      return true;
    }

    const resource = await this.resolveResource(meta, request);

    // A closed resource (a course of a hidden köşk) answers its own 404 to
    // everyone but the people above it, whatever the route asks for, so no
    // route has to remember the rule.
    await this.authz.assertOpen(user, resource);
    const allowed = await this.authz.can(user, resource, meta.permission);
    if (!allowed) {
      throw new AuthzForbiddenError(undefined, {
        userId: user.sub,
        entity: resource.entity,
        resourceId: resource.id,
        permission: meta.permission,
      });
    }
    return true;
  }

  /**
   * Run the resolver and validate the result. Domain errors raised by
   * the resolver (HttpException, MedarisError subclasses) propagate
   * as-is so a `NotFoundException` thrown from inside a custom resolver
   * surfaces as 404, not as a generic 500. Everything else is treated
   * as a server-side configuration bug.
   */
  private async resolveResource(
    meta: AuthzMeta,
    request: AuthzRequest
  ): Promise<ResourceRef> {
    let resource: ResourceRef;
    try {
      resource = await meta.resolve(request, this.moduleRef);
    } catch (error) {
      if (error instanceof HttpException || error instanceof MedarisError) {
        throw error;
      }
      throw new AuthzResolverError(
        `@Authz(${String(meta.permission)}) resolver failed`,
        { permission: meta.permission },
        { cause: error }
      );
    }

    if (
      !resource ||
      typeof resource.id !== "string" ||
      resource.id.length === 0
    ) {
      throw new AuthzResolverError(
        `@Authz(${String(meta.permission)}) resolver returned an empty resource ID. Check that the decorator reads the correct request param name.`,
        {
          permission: meta.permission,
          entity: resource?.entity,
          returnedIdType: typeof resource?.id,
        }
      );
    }
    return resource;
  }
}
