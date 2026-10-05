/**
 * What Keşfet's address says (MDRS-159, design tedris/02). The filters live in
 * the URL so a result can be shared and the back button brings the previous
 * filter back; this is the one place that reads and writes them.
 */

export const PAGE_SIZE = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DiscoverQuery {
  page: number;
  madrasahId: string | null;
  q: string;
}

type Raw = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * The query an address stands for. Anything the page does not know is left out
 * rather than sent on: a malformed medrese id and a page that is not a
 * positive whole number both read as "not set", and so do the `level` and
 * `field` of an old link, which Keşfet no longer filters by (MDRS-252).
 */
export const parseDiscoverQuery = (raw: Raw): DiscoverQuery => {
  const madrasahId = first(raw.madrasah);
  const page = Number(first(raw.page));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    madrasahId: madrasahId && UUID.test(madrasahId) ? madrasahId : null,
    q: (first(raw.q) ?? "").trim().slice(0, 100),
  };
};

/** The address (path and query) for a query; the defaults are not written. */
export const discoverHref = (
  query: Partial<DiscoverQuery>,
  path = "/discover"
): string => {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.madrasahId) params.set("madrasah", query.madrasahId);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
};

/** Whether any filter is set (the page number is not a filter). */
export const hasFilter = (query: DiscoverQuery): boolean =>
  Boolean(query.q || query.madrasahId);

/** Pages of `total` köşks, never fewer than one. */
export const pageCount = (total: number, limit = PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / Math.max(1, limit)));
