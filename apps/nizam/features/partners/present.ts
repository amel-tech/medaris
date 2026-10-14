/**
 * "Ortak uygulamalar" (partner enrollments) as rules: what the form may send
 * and how a refusal is worded. Pure, so the view has nothing to decide.
 */

/** tedrisat's shape of a client id: letters, digits, `.`, `_` and `-`, starting with a letter or digit. */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const CLIENT_ID_MAX = 128;
export const NAME_MAX = 100;

/** Why the typed client id cannot be sent, or null; checked before it is. */
export function clientIdProblem(clientId: string): "empty" | "shape" | null {
  if (!clientId) return "empty";
  return CLIENT_ID_PATTERN.test(clientId) ? null : "shape";
}

/** Why the typed name cannot be sent, or null. */
export function nameProblem(name: string): "empty" | "long" | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  return trimmed.length > NAME_MAX ? "long" : null;
}

const errorCode = (body: unknown): string | null =>
  body && typeof body === "object" && "code" in body
    ? String((body as { code: unknown }).code)
    : null;

/** The codes tedrisat answers these routes with, and the message key of each. */
const ERROR_KEYS: Record<string, string> = {
  PARTNER_EXISTS: "errors.exists",
  PARTNER_FRONT_END_CLIENT: "errors.frontEnd",
  PARTNER_UNKNOWN: "errors.gone",
  KOSK_NOT_FOUND: "errors.koskGone",
  VALIDATION_ERROR: "errors.invalid",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The message key (under `nizam.PartnersPage`) of a refused write. */
export const failureKey = (body: unknown): string =>
  ERROR_KEYS[errorCode(body) ?? ""] ?? "errors.generic";

/** Whether two köşk selections hold the same köşks, in any order. */
export function sameKosks(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const held = new Set(a);
  return b.every((id) => held.has(id));
}
