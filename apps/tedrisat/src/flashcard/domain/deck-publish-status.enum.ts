/**
 * Where a deck stands on its way to being public (MDRS-164). `isPublic` stays
 * the one column every read rule is written against; this is the author's
 * request and the reviewer's answer around it, and the two are kept in step by
 * the repository: PUBLISHED exactly when `isPublic` is true.
 */
export enum DeckPublishStatus {
  PRIVATE = "PRIVATE",
  PENDING = "PENDING",
  PUBLISHED = "PUBLISHED",
}
