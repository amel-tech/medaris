export * from "./auth-guard";
export type {
  AuthenticatedUser,
  AuthzMeta,
  AuthzResolve,
  DeckSubType,
  Entity,
  ResourceRef,
  Role,
  RoleResolver,
  Scope,
} from "./authz";
// Named rather than `export *`: this barrel is the package's only entry point
// (no `exports` map), so everything under it is top-level API for both Nest
// services. `MATRIX`, `ROLES`, `Entity`, `Role` are generic enough that a
// later `export *` from another module could shadow one silently — TypeScript
// drops an ambiguous re-export instead of erroring — so the authz vocabulary
// is spelled out here, where a collision is a visible duplicate name.
export {
  AUTHZ_KEY,
  Authz,
  AuthzForbiddenError,
  AuthzGuard,
  AuthzMissingUserError,
  AuthzModule,
  AuthzResolverError,
  AuthzService,
  AuthzWiringAssertion,
  byBody,
  byParam,
  byQuery,
  ENTITIES,
  MATRIX,
  ROLE_RESOLVER,
  ROLES,
  SCOPES,
} from "./authz";
export * from "./bootstrap/setupMiddleware";
export * from "./config";
export * from "./dto/health-check.dto";
export * from "./error";
export * from "./excel";
export * from "./logger";
export * from "./pipes";
export * from "./throttler";
