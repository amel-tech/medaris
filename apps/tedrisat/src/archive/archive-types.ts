/**
 * What the archive lists (MDRS-173, screens nizam/28 and nizam/29). A hidden
 * thing is never deleted: it keeps its row, carries `archived_at` and
 * `archived_by`, and is brought back or removed for real from here.
 *
 * `madrasah` and `recording` are in the vocabulary because the screens' filters
 * name them, but nothing is stored for them yet: a medrese has no hide column
 * and there is no recording model (MDRS-162). They list nothing and answer 404
 * to restore, impact and delete.
 */
export const ARCHIVE_ITEM_TYPES = [
  "kosk",
  "madrasah",
  "course",
  "week",
  "session",
  "recording",
  "deck",
] as const;
export type ArchiveItemType = (typeof ARCHIVE_ITEM_TYPES)[number];

/** The types a köşk's own archive lists: its contents, never the köşk or a medrese. */
export const KOSK_ARCHIVE_ITEM_TYPES: readonly ArchiveItemType[] = [
  "course",
  "week",
  "session",
  "recording",
  "deck",
];

/** The types a medrese's own archive lists: its courses and what is in them (nazir/12). */
export const MADRASAH_ARCHIVE_ITEM_TYPES: readonly ArchiveItemType[] = [
  "course",
  "week",
  "session",
  "recording",
];

/** The types with a table behind them. */
export const STORED_ARCHIVE_ITEM_TYPES: readonly ArchiveItemType[] = [
  "kosk",
  "course",
  "week",
  "session",
  "deck",
];

/** Roles whose label the screens print under the hider's name, nearest scope first. */
export const ARCHIVER_ROLE_ORDER = [
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
] as const;

export const DEFAULT_ARCHIVE_PAGE_SIZE = 10;
export const MAX_ARCHIVE_PAGE_SIZE = 50;

/** One hidden thing as the repository reads it. */
export interface IArchiveItem {
  type: ArchiveItemType;
  id: string;
  title: string;
  koskId: string | null;
  koskName: string | null;
  madrasahId: string | null;
  madrasahName: string | null;
  courseId: string | null;
  courseTitle: string | null;
  weekNumber: number | null;
  scheduledAt: Date | null;
  weekCount: number | null;
  sessionCount: number | null;
  studentCount: number | null;
  archivedAt: Date;
  archivedBy: string | null;
}

export interface IArchiveFilter {
  /** Only what is hidden in this köşk. */
  koskId?: string;
  /** Only what is hidden in courses of this medrese. */
  madrasahId?: string;
  type?: ArchiveItemType;
  /** A fragment of the title, matched case-insensitively. */
  q?: string;
}

export interface IArchiveImpact {
  type: ArchiveItemType;
  id: string;
  title: string;
  courses: number;
  weeks: number;
  sessions: number;
  students: number;
  recordings: number;
  followers: number;
  cards: number;
}

export interface IArchiveScopes {
  kosks: { id: string; name: string }[];
  madrasahs: { id: string; name: string }[];
}
