import type { IPartnerActor } from "./domain/partner-actor";

/** The partner application a verified token belongs to (`PartnerGuard`). */
export interface IPartnerCaller extends IPartnerActor {
  /**
   * The subject of the partner client's service account, a Keycloak user id:
   * what the audit log records as the actor (`audit_log.actor_id` is a uuid).
   */
  actorId: string;
}

/**
 * A request on `/integrations/*`. `PartnerGuard` sets `partner` and never
 * `user`: the global interceptors that act on `user` (recording the caller in
 * `users`, the per-user rate limit) have nothing to do with a partner's
 * service account, and no route that reads `user` can be reached with it.
 */
export interface PartnerRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  originalUrl?: string;
  partner?: IPartnerCaller;
}
