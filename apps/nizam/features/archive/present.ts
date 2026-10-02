import type {
  ArchiveImpactResponse,
  ArchiveItemResponse,
} from "@medaris/services/tedrisat";

/**
 * Pure helpers behind the archive screens (nizam 28 and 29, MDRS-173): how a
 * row reads, when it was hidden, what a permanent delete takes with it. No
 * React and no I/O, so the sentences and counts the designs show can be
 * pinned by plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/** The type filter, in the order the designs list it. */
export const TYPE_FILTERS = [
  "course",
  "week",
  "session",
  "recording",
  "deck",
] as const;
export const PLATFORM_TYPE_FILTERS = ["kosk", "madrasah", ...TYPE_FILTERS];

export type ScopeValue = "all" | `kosk:${string}` | `madrasah:${string}`;

/** The query a scope option stands for. */
export function scopeQuery(scope: ScopeValue): {
  koskId?: string;
  madrasahId?: string;
} {
  if (scope.startsWith("kosk:")) return { koskId: scope.slice(5) };
  if (scope.startsWith("madrasah:")) return { madrasahId: scope.slice(9) };
  return {};
}

const dayKey = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

/**
 * "Dün 18:20" for yesterday, "Bugün 09:05" for today, "29 Eyl 14:05" before
 * that — the designs' Gizlendiği tarih column, in the viewer's zone.
 */
export function hiddenAtLabel(
  at: Date,
  now: Date,
  opts: { locale: string; timeZone: string; t: Messages }
): string {
  const { locale, timeZone, t } = opts;
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  const key = dayKey(at, timeZone);
  if (key === dayKey(now, timeZone)) return t("today", { time });
  if (key === dayKey(new Date(now.getTime() - 24 * 3_600_000), timeZone)) {
    return t("yesterday", { time });
  }
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(at);
  return `${date} ${time}`;
}

/** "3 Eki Cmt 21:00": when a hidden session was to be held. */
export function sessionWhen(
  at: Date,
  opts: { locale: string; timeZone: string }
): string {
  return new Intl.DateTimeFormat(opts.locale, {
    timeZone: opts.timeZone,
    day: "numeric",
    month: "short",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

const nonEmpty = (x: string | null | undefined): x is string => Boolean(x);

/**
 * The grey line under a hidden item's title — "Hafta 5 · Emsile ve Bina ·
 * 3 Eki Cmt 21:00". What it names depends on the type: a session says its
 * week, course and time; a week its number, session count and course; a
 * course its weeks and talebe. A medrese course names its medrese last.
 */
export function contextParts(
  item: ArchiveItemResponse,
  t: Messages,
  when: (at: Date) => string
): string[] {
  switch (item.type) {
    case "session":
      return [
        item.weekNumber == null
          ? null
          : t("context.week", { count: item.weekNumber }),
        item.courseTitle,
        item.scheduledAt ? when(new Date(item.scheduledAt)) : null,
        item.madrasahName,
      ].filter(nonEmpty);
    case "week":
      return [
        item.weekNumber == null
          ? null
          : t("context.week", { count: item.weekNumber }),
        item.sessionCount
          ? t("context.sessions", { count: item.sessionCount })
          : null,
        item.courseTitle,
        item.madrasahName,
      ].filter(nonEmpty);
    case "course":
      return [
        item.weekCount == null
          ? null
          : t("context.weeks", { count: item.weekCount }),
        item.studentCount == null
          ? null
          : t("context.students", { count: item.studentCount }),
        item.madrasahName,
      ].filter(nonEmpty);
    default:
      return [];
  }
}

/** "Geri al: Maksûd okumaları, 8 hafta · 19 talebe" — the button's accessible name. */
export function actionName(
  template: "restoreLabel" | "permanentDeleteLabel",
  item: ArchiveItemResponse,
  t: Messages,
  context: string[]
): string {
  const name = [item.title, context.join(" · ")].filter(nonEmpty).join(", ");
  return t(template, { name });
}

export interface ImpactLine {
  key:
    | "courses"
    | "weeks"
    | "sessions"
    | "students"
    | "recordings"
    | "followers"
    | "cards";
  text: string;
}

/**
 * The lines of the permanent-delete dialog (nizam 29, criterion 2): what goes
 * with the item. A count of zero is not a line — the dialog lists what is
 * lost, not what is not — and a course's weeks read as its syllabus.
 */
export function impactLines(
  impact: Pick<
    ArchiveImpactResponse,
    | "type"
    | "courses"
    | "weeks"
    | "sessions"
    | "students"
    | "recordings"
    | "followers"
    | "cards"
  >,
  t: Messages
): ImpactLine[] {
  const lines: ImpactLine[] = [];
  const add = (key: ImpactLine["key"], count: number, textKey: string) => {
    if (count > 0) lines.push({ key, text: t(`dialog.${textKey}`, { count }) });
  };
  add("courses", impact.courses, "courses");
  add("weeks", impact.weeks, impact.type === "course" ? "weeks" : "weeksOnly");
  add("students", impact.students, "students");
  add("sessions", impact.sessions, "sessions");
  add("recordings", impact.recordings, "recordings");
  add("followers", impact.followers, "followers");
  add("cards", impact.cards, "cards");
  return lines;
}

/** The status the page shows under the table: "18 öğeden 10’u gösteriliyor". */
export function shownLabel(shown: number, total: number, t: Messages): string {
  return t("showing", { shown, total });
}

/** True while there is more to ask for. */
export function hasMore(loaded: number, total: number): boolean {
  return loaded < total;
}

/** The first line under the hider's name; null reads as unknown. */
export function archiverLine(
  item: Pick<ArchiveItemResponse, "archivedBy">,
  t: Messages
): { name: string; role: string | null } {
  const by = item.archivedBy;
  if (!by) return { name: t("unknownPerson"), role: null };
  return {
    name: by.name ?? t("unknownPerson"),
    role: by.role ? t(`roles.${by.role}`) : null,
  };
}
