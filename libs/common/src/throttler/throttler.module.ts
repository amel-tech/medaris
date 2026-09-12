import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { buildThrottlerOptions } from "./throttler.config";

/**
 * Rate limiting for both Nest APIs (MDRS-31).
 *
 * Imported by each app's `AppModule` rather than installed from
 * `applyGlobalMiddleware`: `ThrottlerGuard` is a Nest guard with injected
 * dependencies, so it has to be registered in the container, and
 * `applyGlobalMiddleware` runs against an application that is already built.
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
 * ordering rather than trusting it.
 *
 * `forRootAsync` over `forRoot` because the options are read from the
 * environment: `forRoot(buildThrottlerOptions())` would evaluate its argument
 * when this file is imported, and `useFactory` runs when the container is
 * initialised — after `load-env` has applied the root `.env`. The same trap
 * cost `buildCorsConfig` a task of its own (MDRS-34).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => buildThrottlerOptions(),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class RateLimitModule {}
