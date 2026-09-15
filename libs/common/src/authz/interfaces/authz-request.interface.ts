import type { AuthenticatedUser } from "./authenticated-user.interface";

/**
 * The slice of the HTTP request the authorization layer reads: the three
 * places a resource id can come from, and the user `AuthGuard` attached.
 *
 * Declared here rather than imported from `express` on purpose. This
 * library ships no runtime dependency on express — the Nest apps bring it
 * through `@nestjs/platform-express` — and an `import { Request } from
 * "express"` reads as one to `depcheck`, which fails the Security gates
 * job on it. Express's `Request` is structurally assignable to this, so
 * `ctx.switchToHttp().getRequest<AuthzRequest>()` needs no cast.
 */
export interface AuthzRequest {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  user?: AuthenticatedUser;
}
