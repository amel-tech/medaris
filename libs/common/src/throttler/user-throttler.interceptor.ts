import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import type { AuthenticatedUser } from "../authz/interfaces/authenticated-user.interface";

export const USER_THROTTLER_OPTIONS = "UserThrottlerOptionsToken";

type MaybeAuthenticated = { user?: AuthenticatedUser };

/**
 * The per-user rate limit: requests per route per window for one signed-in
 * person, keyed by the verified token's `sub` (2026-10-12 incident).
 *
 * An interceptor because Nest runs interceptors after every guard: wherever
 * `AuthGuard` sits — on a controller, on a handler, on one added later —
 * `request.user` is set by the time this runs, and no controller has to name
 * it. A guard listed next to `AuthGuard` would have to be added to every
 * controller that has one, and would be missing from any that forgets; a check
 * inside `AuthzGuard` would miss the controllers that use `AuthGuard` alone.
 * The cost of running after the guards: a refused request has still paid for
 * `AuthzGuard`'s lookups, but not for route interceptors (multer), pipes or the
 * handler.
 *
 * It extends `ThrottlerGuard` for its counting, its headers and its
 * `@Throttle` / `@SkipThrottle` metadata, under its own throttler name
 * (`USER_THROTTLER`) and its own options, in the store the address layer uses.
 *
 * A request without a user is not counted here. Its key would be the address,
 * which the address layer already counts against a budget sized for an address
 * every caller shares; counting it again against one person's budget would put
 * every signed-out visitor, all arriving through the same proxy or web server,
 * into one small bucket.
 */
@Injectable()
export class UserThrottlerInterceptor
  extends ThrottlerGuard
  implements NestInterceptor
{
  constructor(
    @Inject(USER_THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector
  ) {
    super(options, storage, reflector);
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<ReturnType<CallHandler["handle"]>> {
    if (context.getType() === "http") {
      const request = context.switchToHttp().getRequest<MaybeAuthenticated>();
      if (request.user) {
        // Throws ThrottlerException, a 429, past the budget.
        await this.canActivate(context);
      }
    }
    return next.handle();
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return String((req as MaybeAuthenticated).user?.sub);
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail
  ): Promise<void> {
    // The library suffixes a named throttler's header (`Retry-After-user`);
    // clients back off on the standard one.
    this.getRequestResponse(context).res.header(
      "Retry-After",
      detail.timeToBlockExpire
    );
    await super.throwThrottlingException(context, detail);
  }
}
