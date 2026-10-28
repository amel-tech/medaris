import type { MadrasahAppealRowResponse } from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the medrese's İtirazlar: the course requests a köşk
 * refused, and the appeal the medrese opened against each. No React and no
 * I/O, so the rules can be pinned by plain specs.
 */
export const APPEAL_REASON_MAX = 1000;

export type AppealStatusKey = "NONE" | "PENDING" | "ACCEPTED" | "REJECTED";

export interface AppealRow {
  id: string;
  title: string;
  kosk: string;
  rejectReason: string;
  status: AppealStatusKey;
  note: string;
  /** "İtiraz aç" is offered: the request is refused and has no appeal yet */
  canAppeal: boolean;
}

export const isBlank = (text: string): boolean => text.trim().length === 0;

const statusOf = (row: MadrasahAppealRowResponse): AppealStatusKey => {
  const status = row.appeal?.status;
  return status === "PENDING" || status === "ACCEPTED" || status === "REJECTED"
    ? status
    : "NONE";
};

/** The table's rows, as the API lists them (newest request first). */
export const appealRows = (rows: MadrasahAppealRowResponse[]): AppealRow[] =>
  rows.map((row) => ({
    id: row.courseRequestId,
    title: row.title,
    kosk: row.kosk.name,
    rejectReason: row.rejectReason ?? "",
    status: statusOf(row),
    note: row.appeal?.decisionNote ?? "",
    canAppeal: row.appeal == null && row.requestStatus === "REJECTED",
  }));

/** The badge of each status. */
export const STATUS_VARIANT: Record<
  AppealStatusKey,
  "secondary" | "warning" | "success" | "error"
> = {
  NONE: "secondary",
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "error",
};

const ERROR_KEYS: Record<string, string> = {
  APPEAL_EXISTS: "Appeals.errors.exists",
  APPEAL_REQUEST_NOT_REJECTED: "Appeals.errors.notRejected",
  APPEAL_REQUEST_NOT_FOUND: "Appeals.errors.gone",
  AUTHZ_FORBIDDEN: "Appeals.errors.forbidden",
};

/** The message key of a refusal's code; anything unknown is the generic one. */
export const appealErrorKey = (code: string): string =>
  ERROR_KEYS[code] ?? "Appeals.errors.generic";

/** Whether the refusal means the list has moved and should be read again. */
export const listMoved = (code: string): boolean =>
  [
    "APPEAL_EXISTS",
    "APPEAL_REQUEST_NOT_REJECTED",
    "APPEAL_REQUEST_NOT_FOUND",
  ].includes(code);
