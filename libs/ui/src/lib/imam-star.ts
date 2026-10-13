/**
 * Whether a course's imam is marked (the owner's decision of 2026-10-13): only
 * in a course with more than one müderris. A lone müderris is the imam by
 * default and gets no mark at all, neither the star nor a word; a count the
 * caller does not know is no mark either.
 *
 * Kept apart from `mds/imam-star.tsx`, which is a client module: a server
 * component that called a function exported from there would get a client
 * reference instead of the function.
 */
export const showsImamStar = (
  isImam: boolean,
  muderrisCount: number | null | undefined
): boolean => isImam && (muderrisCount ?? 0) > 1;
