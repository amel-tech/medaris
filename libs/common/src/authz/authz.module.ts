import { Global, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { AuthzGuard } from "./authz.guard";
import { AuthzService } from "./authz.service";
import { AuthzWiringAssertion } from "./authz-wiring.assertion";

/**
 * Provides {@link AuthzService} (matrix decision) and {@link AuthzGuard}
 * (`@Authz` enforcement).
 *
 * `@Global()` so feature modules don't have to re-import it just to use
 * `@UseGuards(AuthGuard, AuthzGuard)`. The concrete `RoleResolver`
 * implementation is provided once per app (e.g. tedrisat binds
 * `TedrisatRoleResolver` to the `ROLE_RESOLVER` token); this module
 * does not bind a default to avoid a hidden production fallback.
 *
 * `AuthzGuard` is deliberately NOT registered as an `APP_GUARD`: a global
 * guard runs before controller-scoped ones, so it would run before
 * `AuthGuard` has set `request.user` and fail every annotated route. The
 * guard stays route-scoped and {@link AuthzWiringAssertion} makes the
 * omission loud at boot instead — an `@Authz` handler with no `AuthzGuard`
 * in scope refuses to start rather than silently granting.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [AuthzService, AuthzGuard, AuthzWiringAssertion],
  exports: [AuthzService, AuthzGuard],
})
export class AuthzModule {}
