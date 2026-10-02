import { BadRequestException } from "@nestjs/common";
import type { AuthzRequest } from "./interfaces/authz-request.interface";
import { Entity, ResourceRef } from "./scopes";

/** Narrow Express's loosely-typed param values to a plain string.
 *  Anything non-stringy (array, object, undefined) falls back to an
 *  empty string, which the guard rejects as a configuration error so
 *  the operator notices a route-param mismatch instead of seeing a
 *  misleading 403. Right for route params, whose shape the router fixes. */
const stringOf = (raw: unknown): string => (typeof raw === "string" ? raw : "");

/** For body and query fields, whose shape the CLIENT chooses. Guards run
 *  before pipes, so the DTO has not validated the payload yet; a number, an
 *  array (`?id=a&id=b`) or an absent field here is a malformed request and
 *  answers 400, not the configuration-error 500 the empty-string path would
 *  produce on every request the caller chooses to malform. */
const clientStringOf = (raw: unknown, field: string): string => {
  if (typeof raw === "string" && raw.length > 0) return raw;
  throw new BadRequestException(`'${field}' must be a non-empty string`);
};

/**
 * Resolver that pulls the resource ID from a route param.
 *
 * @example
 *   @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE))           // reads :id
 *   @Authz(SCOPES.EDIT, byParam(ENTITIES.COURSE, 'courseId')) // reads :courseId
 */
export const byParam =
  (entity: Entity, param = "id") =>
  (req: AuthzRequest): ResourceRef => ({
    entity,
    id: stringOf(req.params[param]),
  });

/**
 * Resolver that pulls the resource ID from a body field. Useful when a
 * new resource is authorized against its parent — e.g. creating a course
 * is gated by `manage_courses` on the kosk named in the body.
 */
export const byBody =
  (entity: Entity, field: string) =>
  (req: AuthzRequest): ResourceRef => ({
    entity,
    id: clientStringOf(
      (req.body as Record<string, unknown> | undefined)?.[field],
      field
    ),
  });

/**
 * Resolver that pulls the resource ID from a query string. Useful for
 * list endpoints whose authz target is the parent resource named via
 * `?parentId=...`.
 */
export const byQuery =
  (entity: Entity, field: string) =>
  (req: AuthzRequest): ResourceRef => ({
    entity,
    id: clientStringOf(req.query[field], field),
  });

/**
 * Resolver for a create endpoint: there is no resource ID yet, so the
 * check is "may this caller create one of these at all".
 *
 * The sentinel is a non-UUID string on purpose. Every `RoleResolver`
 * implementation already has to answer for an id that is not a UUID —
 * malformed input reaches the guard before any pipe has validated it —
 * and `TedrisatRoleResolver` answers `ROLES.PUBLIC` there rather than
 * letting Postgres raise 22P02. A create scope therefore has to live on
 * the entity's `PUBLIC` matrix row to pass, which is exactly the
 * decision the matrix should be making: `CREATE_PRIVATE_DECK` is on that
 * row, `CREATE_KOSK` is deliberately on none.
 *
 * Do NOT give this an id that could collide with a real row — the guard
 * rejects an empty id as a configuration error, and a UUID here would
 * silently authorize against whatever row happens to carry it.
 */
export const forNew = (entity: Entity) => (): ResourceRef => ({
  entity,
  id: "new",
});
