import { errorCode } from "../platform-admin/present";

/**
 * Pure helpers behind İtirazlar (nizam): the medreses' appeals against a köşk
 * refusing their course requests. No React and no I/O.
 */
const ERROR_KEYS: Record<string, string> = {
  APPEAL_NOT_PENDING: "errors.answered",
  APPEAL_NOT_FOUND: "errors.gone",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The message key (under `nizam.AppealsPage`) of a refusal's code. */
export const appealFailureKey = (body: unknown): string =>
  ERROR_KEYS[errorCode(body) ?? ""] ?? "errors.generic";

/** Whether the refusal says the appeal was decided meanwhile or is gone. */
export const appealSettled = (body: unknown): boolean =>
  ["APPEAL_NOT_PENDING", "APPEAL_NOT_FOUND"].includes(errorCode(body) ?? "");

/** The badge of an appeal's status. */
export const appealVariant = (
  status: string
): "warning" | "success" | "error" =>
  status === "ACCEPTED"
    ? "success"
    : status === "REJECTED"
      ? "error"
      : "warning";
