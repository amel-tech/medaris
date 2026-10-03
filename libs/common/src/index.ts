export * from "./auth-guard";
export type {
  AnonymousRelation,
  AssignedRole,
  AuthenticatedUser,
  AuthzAuditSink,
  AuthzContextLoader,
  AuthzMeta,
  AuthzRequest,
  AuthzResolve,
  DeckSubType,
  Entity,
  IAuthzAuditEntry,
  IAuthzContext,
  IAuthzFacts,
  IDeckVisibility,
  IEffective,
  IHeldGrantCodes,
  IHeldRole,
  IPermissionMeta,
  IPolicyOn,
  PermissionCode,
  PolicyKey,
  Relation,
  ResourceRef,
  Role,
  RoleResolver,
  ScopeRef,
  ScopeType,
} from "./authz";
// Named rather than `export *`: this barrel is the package's only entry point
// (no `exports` map), so everything under it is top-level API for both Nest
// services. `ROLES`, `Entity`, `Role` are generic enough that a later
// `export *` from another module could shadow one silently — TypeScript drops
// an ambiguous re-export instead of erroring — so the authz vocabulary is
// spelled out here, where a collision is a visible duplicate name.
export {
  ASSIGNED_ROLES,
  AUTHZ_AUDIT,
  AUTHZ_CONTEXT,
  AUTHZ_EXEMPT_KEY,
  AUTHZ_KEY,
  AUTHZ_PUBLIC_KEY,
  Authz,
  AuthzExempt,
  AuthzForbiddenError,
  AuthzGuard,
  AuthzMissingUserError,
  AuthzModule,
  AuthzPublic,
  AuthzResolverError,
  AuthzService,
  AuthzWiringAssertion,
  authorityAbove,
  byBody,
  byParam,
  byQuery,
  ENTITIES,
  effectivePermissions,
  forNew,
  GRANTABLE_CODES,
  isPermissionCode,
  LISTED_CODES,
  MANAGER_ROLE_OF,
  PERMISSION_META,
  PERMISSIONS,
  POLICY_CLOSES,
  POLICY_KEYS,
  RELATION_CODES,
  RELATIONS,
  ROLE_DEFAULT_PERMISSIONS,
  ROLE_RESOLVER,
  ROLE_SCOPE_TYPES,
  ROLES,
  relationCodes,
  roleCodesAt,
  roleCoversScope,
  SCOPE_TYPES,
} from "./authz";
export * from "./bootstrap/setupMiddleware";
export * from "./config";
export * from "./dto/health-check.dto";
export * from "./error";
export * from "./excel";
export * from "./logger";
export * from "./pipes";
export * from "./throttler";
