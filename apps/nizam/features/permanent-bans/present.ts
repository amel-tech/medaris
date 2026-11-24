import type { PermanentBanRequestBanResponse } from "@medaris/services/tedrisat";
import { errorCode } from "../platform-admin/present";

/**
 * Pure helpers behind Kalıcı yasak talepleri (nizam 45, MDRS-194): the
 * requests a lower kademe opened for a ban to become a platform ban. No React
 * and no I/O.
 */
const ERROR_KEYS: Record<string, string> = {
  PERMANENT_BAN_REQUEST_NOT_PENDING: "errors.answered",
  PERMANENT_BAN_REQUEST_NOT_FOUND: "errors.gone",
  BAN_NOT_FOUND: "errors.gone",
  BAN_ALREADY_LIFTED: "errors.lifted",
  BAN_TARGET_INVALID: "errors.target",
  BAN_FORBIDDEN: "errors.forbidden",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The message key (under `nizam.PermanentBansPage`) of a refusal's code. */
export const permanentBanFailureKey = (body: unknown): string =>
  ERROR_KEYS[errorCode(body) ?? ""] ?? "errors.generic";

/** Whether the refusal says the request was decided meanwhile or is gone. */
export const permanentBanSettled = (body: unknown): boolean =>
  [
    "PERMANENT_BAN_REQUEST_NOT_PENDING",
    "PERMANENT_BAN_REQUEST_NOT_FOUND",
  ].includes(errorCode(body) ?? "");

/** The badge of a request's status. */
export const permanentBanVariant = (
  status: string
): "warning" | "success" | "error" =>
  status === "APPROVED"
    ? "success"
    : status === "REJECTED"
      ? "error"
      : "warning";

/** What the lower ban names, widest last: "Emsile ve Bina, Nûruosmaniye Köşkü". */
export const banPlace = (
  ban: Pick<
    PermanentBanRequestBanResponse,
    "courseTitle" | "koskName" | "madrasahName"
  >
): string =>
  [ban.courseTitle, ban.koskName, ban.madrasahName]
    .filter((x): x is string => Boolean(x))
    .join(", ");

/**
 * Where "Yasaklamalar'da gör" goes: the Medaris-wide list searched for the
 * person. The e-mail is the one value the search matches exactly; a person
 * with neither gets the unfiltered list.
 */
export const bansHref = (
  user: PermanentBanRequestBanResponse["user"]
): string => {
  const needle = user.email ?? user.name;
  return needle
    ? `/yasaklamalar?q=${encodeURIComponent(needle)}`
    : "/yasaklamalar";
};
