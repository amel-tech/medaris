import type { ScopeRef } from "./assignments";
import type { IHeldGrantCodes, IHeldRole } from "./effective-permissions";
import type { IPolicyOn } from "./policies";
import type { ResourceRef } from "./scopes";

/**
 * What one decision needs to know about a resource and the caller, found in a
 * bounded number of queries: the scope chain, who is passive, which policies
 * are on, and what the caller holds there. Expiry and revocation are decided
 * in the queries against `now()`, so nothing here outlives its own end and no
 * cache is needed (MDRS-46 is a separate issue).
 */
export interface IAuthzContext {
  /** The scopes the resource sits in, narrowest first, always ending with the platform. */
  chain: ScopeRef[];
  /** The course is held for a medrese: it sits in both its köşk and its medrese. */
  madrasahCourse: boolean;
  /** The first passive scope in the chain, or null. */
  passiveScope: ScopeRef | null;
  policies: IPolicyOn[];
  roles: IHeldRole[];
  grants: IHeldGrantCodes[];
}

/** A deck's visibility, for the rule that the başnazım reads a private deck and writes nothing. */
export interface IDeckVisibility {
  isPublic: boolean;
  authorId: string;
}

export interface AuthzContextLoader {
  load(userId: string, resource: ResourceRef): Promise<IAuthzContext>;
  /** Null when the deck does not exist. */
  findDeck(id: string): Promise<IDeckVisibility | null>;
}

/** DI token for the {@link AuthzContextLoader} contract. */
export const AUTHZ_CONTEXT = Symbol("AUTHZ_CONTEXT");

/** One row for the audit trail. */
export interface IAuthzAuditEntry {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}

/**
 * Where a decision writes its own audit rows: a read of course content by
 * someone who is neither an enrolled talebe nor the course's müderris, a
 * passive scope opened by platform management, a başnazım's read of a private
 * deck. Optional: an app that binds no sink writes nothing.
 */
export interface AuthzAuditSink {
  record(entry: IAuthzAuditEntry): Promise<void>;
}

/** DI token for the {@link AuthzAuditSink} contract. */
export const AUTHZ_AUDIT = Symbol("AUTHZ_AUDIT");
