import type {
  IAgendaStep,
  ICreateWeek,
  ILesson,
  IWeek,
} from "../course.repository.interface";

/** The lesson fields that are session work, not curriculum (MDRS-135). */
type SessionFields = Pick<
  ILesson,
  "scheduledAt" | "meetingUrl" | "agenda" | "isPreview"
>;

/**
 * What a whole-course save sends for one lesson. The DTO's `@IsOptional()`
 * lets null through as well as a missing key, and the replace writes it.
 */
interface SentLesson {
  scheduledAt?: Date | null;
  meetingUrl?: string | null;
  agenda?: IAgendaStep[] | null;
  isPreview?: boolean | null;
}

const sameInstant = (a: Date | null, b: Date | null): boolean =>
  a === null || b === null ? a === b : a.getTime() === b.getTime();

/** A blank link and no link are the same: neither is one a talebe can open. */
const link = (value: string | null | undefined): string | null =>
  value?.trim() || null;

/** An empty agenda and no agenda are the same; keys compare in a fixed order. */
const agendaKey = (steps: readonly IAgendaStep[] | null | undefined): string =>
  JSON.stringify((steps ?? []).map((step) => [step.time, step.title]));

/**
 * Whether the save writes a session field of a lesson it keeps. Mirrors what
 * `CourseRepository.replace` writes: a field the payload leaves out is not
 * written (Drizzle skips an undefined key), except `isPreview`, which a full
 * replace sets to false when it is missing.
 */
function sessionFieldsDiffer(stored: SessionFields, sent: SentLesson): boolean {
  if (
    sent.scheduledAt !== undefined &&
    !sameInstant(stored.scheduledAt, sent.scheduledAt ?? null)
  ) {
    return true;
  }
  if (
    sent.meetingUrl !== undefined &&
    link(stored.meetingUrl) !== link(sent.meetingUrl)
  ) {
    return true;
  }
  if (
    sent.agenda !== undefined &&
    agendaKey(stored.agenda) !== agendaKey(sent.agenda)
  ) {
    return true;
  }
  return (sent.isPreview ?? false) !== stored.isPreview;
}

/**
 * Whether a whole-course save (`PUT /courses/:id`) does session work: it adds
 * a session, drops one (the replace hides it), or changes a kept session's
 * time, meeting link, agenda or preview flag. That is `session.manage`'s
 * ("Celse ekle, tarihini değiştir, iptal et; toplantı bağlantısını gir"), not
 * `course.edit`'s, which keeps the titles, texts, order and weeks.
 *
 * Lessons are matched as `CourseRepository.replace` matches them: by id
 * across the whole course, each stored id claimed once. A lesson with no id,
 * an id that is not one of the course's live lessons, or an id already
 * claimed earlier in the payload is inserted, so it is a new session; a
 * stored lesson no payload row claims is hidden. Moving a lesson to another
 * week or retitling it is curriculum and is not session work.
 *
 * `stored` is the course's live weeks with their live lessons, as
 * `findDetailById` returns them.
 */
export function sessionWorkChanged(
  stored: readonly Pick<IWeek, "lessons">[],
  next: readonly Pick<ICreateWeek, "lessons">[]
): boolean {
  const byId = new Map<string, SessionFields>();
  for (const week of stored) {
    for (const lesson of week.lessons) byId.set(lesson.id, lesson);
  }
  const claimed = new Set<string>();
  for (const week of next) {
    for (const lesson of week.lessons ?? []) {
      const kept = lesson.id ? byId.get(lesson.id) : undefined;
      if (!lesson.id || !kept || claimed.has(lesson.id)) return true;
      claimed.add(lesson.id);
      if (sessionFieldsDiffer(kept, lesson)) return true;
    }
  }
  return claimed.size !== byId.size;
}
