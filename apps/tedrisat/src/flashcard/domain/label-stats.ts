/**
 * What the two label stats readers answer (`FlashcardLabelService.getLabelStats`,
 * `FlashcardDeckLabelService.getDeckLabelStats`). The stats row is created
 * lazily, on the first labeling, so a label that exists and was never applied
 * has no row: the services answer that with zero counts and a `null`
 * `lastUsedAt` rather than a 404, which is reserved for a label that does not
 * exist (MDRS-58 review). Declared once here rather than as a twin in each
 * repository interface — the two label subsystems are already near-duplicates
 * of one another, and every extra pair is one more place a fix lands on one
 * side only.
 */
export interface ILabelStatsRead {
  labelId: string;
  usageCount: number;
  lastUsedAt: Date | null;
}
