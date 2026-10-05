/**
 * What the notes panel derives from a note or from what the talebe types
 * (MDRS-150). Pure: a spec pins every rule.
 */

/** The API's limit on a note's Markdown source (`LESSON_NOTE_BODY_MAX`). */
export const LESSON_NOTE_BODY_MAX = 4000;

/** The API's latest position, 99:59:59 (`LESSON_NOTE_OFFSET_MAX`). */
export const LESSON_NOTE_OFFSET_MAX = 359_999;

/** Whether an enrollment status may write notes: the API's rule, for the form. */
export const canWriteNotes = (status: string | null | undefined): boolean =>
  status === "ENROLLED" || status === "COMPLETED";

/**
 * The panel's order, the API's: by position, notes without one last, then
 * oldest first. A note just written is placed with it, without a re-read.
 */
export const sortNotes = <
  T extends { offsetSeconds: number | null; createdAt: Date },
>(
  notes: T[]
): T[] =>
  [...notes].sort((a, b) => {
    if (a.offsetSeconds !== b.offsetSeconds) {
      if (a.offsetSeconds === null) return 1;
      if (b.offsetSeconds === null) return -1;
      return a.offsetSeconds - b.offsetSeconds;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

const two = (n: number) => String(n).padStart(2, "0");

/** `754` as `12:34`, `3723` as `1:02:03`. */
export const formatOffset = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
};

export type ParsedOffset = { ok: true; seconds: number | null } | { ok: false };

/**
 * What a time field holds as seconds: empty is "no position", plain digits
 * are seconds, `12:34` is minutes and seconds, `1:02:03` hours, minutes and
 * seconds. Minutes and seconds past 59 are refused where they have a larger
 * unit before them; a value past the API's limit is refused.
 */
export const parseOffset = (text: string): ParsedOffset => {
  const value = text.trim();
  if (value === "") return { ok: true, seconds: null };
  if (!/^\d+(?::\d{1,2}){0,2}$/.test(value)) return { ok: false };
  const parts = value.split(":").map(Number);
  let seconds: number;
  if (parts.length === 1) {
    seconds = parts[0];
  } else if (parts.length === 2) {
    if (parts[1] > 59) return { ok: false };
    seconds = parts[0] * 60 + parts[1];
  } else {
    if (parts[1] > 59 || parts[2] > 59) return { ok: false };
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return seconds > LESSON_NOTE_OFFSET_MAX
    ? { ok: false }
    : { ok: true, seconds };
};
