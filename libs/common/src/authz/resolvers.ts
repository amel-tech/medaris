import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";
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
  (req: Request): ResourceRef => ({
    entity,
    id: stringOf((req.params as Record<string, unknown>)[param]),
  });

/**
 * Resolver that pulls the resource ID from a body field. Useful when a
 * new resource is authorized against its parent — e.g. creating a course
 * is gated by `manage_courses` on the kosk named in the body.
 */
export const byBody =
  (entity: Entity, field: string) =>
  (req: Request): ResourceRef => ({
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
  (req: Request): ResourceRef => ({
    entity,
    id: clientStringOf(
      (req.query as Record<string, unknown> | undefined)?.[field],
      field
    ),
  });
