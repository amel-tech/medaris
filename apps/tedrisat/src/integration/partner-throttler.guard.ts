import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import {
  resolvePartnerThrottlerLimit,
  resolvePartnerThrottlerTtl,
} from "../config/throttle-env";
import type { PartnerRequest } from "./partner-request";

export const PARTNER_THROTTLER_OPTIONS = "PartnerThrottlerOptionsToken";

/** The partner budget's throttler name: `@Throttle({ partner: … })` tunes it on a route. */
export const PARTNER_THROTTLER = "partner";

/**
 * Read per request, like `BULK_THROTTLE`, so a deployment retunes it without a
 * rebuild; see `resolvePartnerThrottlerLimit` for the budget.
 */
export const buildPartnerThrottlerOptions = (): ThrottlerModuleOptions => ({
  throttlers: [
    {
      name: PARTNER_THROTTLER,
      ttl: () => resolvePartnerThrottlerTtl(),
      limit: () => resolvePartnerThrottlerLimit(),
    },
  ],
});

/**
 * The partner routes' rate limit, per partner and per route (the storage key
 * hashes the controller and the handler, as the other layers' do). Listed
 * after `PartnerGuard`, which has set `request.partner` by then; it counts in
 * the store the other two layers use. The per-user layer does not count these
 * routes: they set no `request.user`.
 */
@Injectable()
export class PartnerThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(PARTNER_THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return `partner:${(req as unknown as PartnerRequest).partner?.clientId ?? ""}`;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail
  ): Promise<void> {
    // The library suffixes a named throttler's header (`Retry-After-partner`);
    // a partner backs off on the standard one.
    this.getRequestResponse(context).res.header(
      "Retry-After",
      detail.timeToBlockExpire
    );
    await super.throwThrottlingException(context, detail);
  }
}
