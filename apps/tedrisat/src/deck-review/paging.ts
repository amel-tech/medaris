/**
 * The paging shape of the köşk lists (`kosk.controller.ts`): `page` from 1,
 * `limit` 12 unless asked, never more than `MAX_PAGE_SIZE` rows in one reply.
 */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

/** The page and limit a caller asked for, held to what the list allows. */
export function pagingOf(
  page: number,
  limit: number
): { page: number; limit: number; offset: number } {
  const safePage = page < 1 ? 1 : page;
  const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}
