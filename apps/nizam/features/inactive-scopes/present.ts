import type {
  InactiveScopeResponse,
  InactiveScopeType,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind Pasif kapsamlar (nizam 14, MDRS-172): the type filter,
 * "4 gündür", what the Neden column says, the buttons a row carries and where
 * "İçeriği gör" goes. No React and no I/O, so the sentences and rules the
 * design shows can be pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

export type TypeFilter = "ALL" | InactiveScopeType;

export const TYPE_FILTERS: TypeFilter[] = ["ALL", "KOSK", "MADRASAH", "COURSE"];

/** Rows of the chosen kind; "Tümü" keeps them all. */
export function filterByType(
  rows: readonly InactiveScopeResponse[],
  filter: TypeFilter
): InactiveScopeResponse[] {
  return filter === "ALL" ? [...rows] : rows.filter((r) => r.type === filter);
}

const dayOf = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
};

/** Whole calendar days since the scope went passive, in the viewer's zone ("4 gündür"); never negative. */
export function daysPassive(
  since: Date | string,
  now: Date,
  timeZone: string
): number {
  const days = Math.round(
    (dayOf(now, timeZone) - dayOf(new Date(since), timeZone)) / 86_400_000
  );
  return Math.max(days, 0);
}

/** The `nizam.InactivePage.reasons` key for a row: the kind of scope and how the last post ended. */
export function reasonKey(
  row: Pick<InactiveScopeResponse, "type" | "reason">
): string {
  return `${row.type}_${row.reason}`;
}

/** The button a row carries first ("Başmüderris ata", "Köşk nazımı ata", "Müderris ata"). */
export const assignKey = (type: InactiveScopeType): string => `assign.${type}`;

/**
 * Where "İçeriği gör" opens, without the locale. A köşk and a course have a
 * page in Nizam; a medrese has none (its page is the visitors' in Tedris and
 * is closed while it is passive), so that row carries no such button.
 */
export function contentPath(row: InactiveScopeResponse): string | null {
  if (row.type === "KOSK") return `/kosks/${row.id}`;
  if (row.type === "COURSE" && row.kosk) {
    return `/kosks/${row.kosk.id}/courses/${row.id}/edit`;
  }
  return null;
}

const KNOWN: Record<string, string> = {
  INACTIVE_SCOPE_NOT_FOUND: "errors.notFound",
  GRANT_EXPIRY_INVALID: "errors.expiryInvalid",
  KOSK_NAZIM_UNKNOWN_ACCOUNT: "errors.unknownAccount",
  AUTHZ_FORBIDDEN: "errors.forbidden",
};

/** The `nizam.InactivePage` key for a refusal's code, or the generic one. */
export function inactiveErrorKey(errorBody: unknown): string {
  const code =
    errorBody && typeof errorBody === "object" && "code" in errorBody
      ? String((errorBody as { code: unknown }).code)
      : "";
  return KNOWN[code] ?? "errors.generic";
}
