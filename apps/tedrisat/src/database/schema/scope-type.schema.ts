import { pgEnum } from "drizzle-orm/pg-core";

/**
 * The kinds of scope a role, a permission grant or a hide is held at. `platform`
 * has no scope id; the other three point at a köşk, a medrese or a course.
 *
 * Kept in its own file, apart from `role-assignment.schema.ts` which re-exports
 * it, so that `kosks`, `madrasahs`, `courses` and `decks` can record the level a
 * hider acted at (MDRS-135) without importing a file that imports them.
 */
export const SCOPE_TYPES = {
  PLATFORM: "platform",
  KOSK: "kosk",
  MADRASAH: "madrasah",
  COURSE: "course",
} as const;
export type ScopeType = (typeof SCOPE_TYPES)[keyof typeof SCOPE_TYPES];

export const scopeType = pgEnum("scope_type", [
  SCOPE_TYPES.PLATFORM,
  SCOPE_TYPES.KOSK,
  SCOPE_TYPES.MADRASAH,
  SCOPE_TYPES.COURSE,
]);
