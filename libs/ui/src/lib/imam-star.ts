/**
 * The rule and the words of the imam's star (`mds/imam-star.tsx`). Kept apart
 * from the component, which is a client module: a server component that
 * called a function exported from there would get a client reference instead
 * of the function.
 */

/**
 * Whether a course's imam is marked (the owner's decision of 2026-10-13): only
 * in a course with more than one müderris. A lone müderris is the imam by
 * default and gets no mark at all, neither the star nor a word; a count the
 * caller does not know is no mark either.
 */
export const showsImamStar = (
  isImam: boolean,
  muderrisCount: number | null | undefined
): boolean => isImam && (muderrisCount ?? 0) > 1;

/** The star's words, from the caller's catalogue (`common.imamStar`). */
export interface ImamStarLabels {
  /** "Dersin imamı": the button's name and the bubble's title */
  title: string;
  /** what the imam is, the bubble's text */
  body: string;
  /** "dersin imamı": what a screen reader reads for a star that is not a button */
  mark: string;
}

/** The words from a translator of `common.imamStar`, a server one or a client one. */
export const imamStarLabels = (
  t: (key: "title" | "body" | "mark") => string
): ImamStarLabels => ({ title: t("title"), body: t("body"), mark: t("mark") });
