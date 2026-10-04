/**
 * The kademe of a hide (MDRS-135, MDRS-143): the level a hider acted at, lowest
 * first. Only that level or one above brings the thing back, so a screen that
 * cannot offer "Geri al" says who hid it instead of leaving a button that will
 * be refused. The names are `nizam.HideLevel`'s.
 */
export const HIDE_LEVELS = ["course", "madrasah", "kosk", "platform"] as const;
export type HideLevel = (typeof HIDE_LEVELS)[number];

/** The level the API named, or `fallback` for a value it did not (an older response). */
export const hideLevelOf = (
  level: string | null | undefined,
  fallback: HideLevel
): HideLevel =>
  (HIDE_LEVELS as readonly string[]).includes(level ?? "")
    ? (level as HideLevel)
    : fallback;
