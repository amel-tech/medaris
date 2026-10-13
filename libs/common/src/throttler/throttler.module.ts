import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import {
  buildThrottlerOptions,
  buildUserThrottlerOptions,
} from "./throttler.config";
import { MemoryThrottlerStorage } from "./throttler-storage";
import {
  USER_THROTTLER_OPTIONS,
  UserThrottlerInterceptor,
} from "./user-throttler.interceptor";

/**
 * Rate limiting for both Nest APIs (MDRS-31), in two layers since the
 * 2026-10-12 incident (budgets in ./throttler.config.ts):
 *
 * 1. The address layer, `ThrottlerGuard` as an `APP_GUARD`, keyed by the
 *    client's address: a flood guard sized for an address every caller shares.
 * 2. The per-user layer, `UserThrottlerInterceptor` as an `APP_INTERCEPTOR`,
 *    keyed by the verified token's `sub`, after `AuthGuard`.
 *
 * Imported by each app's `AppModule` rather than installed from
 * `applyGlobalMiddleware`: both are Nest enhancers with injected dependencies,
 * so they have to be registered in the container, and `applyGlobalMiddleware`
 * runs against an application that is already built.
 *
 * `APP_GUARD` — and not `app.useGlobalGuards(new ThrottlerGuard(...))` — for
 * the same reason: the token lets Nest construct the guard with its options,
 * its storage and the reflector, which is what makes route-level `@Throttle`
 * overrides visible to it at all.
 *
 * Registering it globally is also what puts it AHEAD of the route-level
 * `AuthGuard`. Nest runs global guards first, then controller, then handler, so
 * a flood of unauthenticated requests is counted and refused with 429 before
 * `AuthGuard` reaches `JwtVerifierService` — where an unknown `kid` costs an
 * outbound JWKS fetch (libs/common/src/auth-guard/key-providers/keycloak-public-key-provider.ts).
 * Registering the throttler on the controllers instead would have left exactly
 * that path open, so apps/tedrisat/test/e2e/throttler.e2e.spec.ts asserts the
 * ordering rather than trusting it. The same position is why it cannot key by
 * user: no token has been read yet.
 *
 * `forRootAsync` over `forRoot`, and factories for both option sets, because
 * the options are read from the environment: `forRoot(buildThrottlerOptions())`
 * would evaluate its argument when this file is imported, and `useFactory`
 * runs when the container is initialised — after `load-env` has applied the
 * root `.env`. The same trap cost `buildCorsConfig` a task of its own
 * (MDRS-34).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      // Not the library's store: see ./throttler-storage.ts.
      useFactory: () => ({
        ...buildThrottlerOptions(),
        storage: new MemoryThrottlerStorage(),
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: USER_THROTTLER_OPTIONS,
      useFactory: () => buildUserThrottlerOptions(),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: UserThrottlerInterceptor,
    },
  ],
})
export class RateLimitModule {}
