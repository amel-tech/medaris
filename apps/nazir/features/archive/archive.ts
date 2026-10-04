import type {
  MadrasahArchiveCountsResponse,
  MadrasahArchiveItemResponse,
} from "@medaris/services/tedrisat";
import type { IconName } from "@medaris/ui/mds/icon";
import { dayKey } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";

/**
 * Arşiv (nazir 12) as rules: the tabs and what each asks the API for, the page
 * of the list, how a hidden item is worded and dated, and who may bring it back.
 * Pure on purpose, so that the page and the table have nothing to decide.
 */

/** The API's default; the page asks for it by name so that the pager and the list agree. */
export const ARCHIVE_PAGE_SIZE = 10;

export type ArchiveTabId = "all" | "course" | "weeks" | "recordings";

export interface ArchiveTab {
  id: ArchiveTabId;
  /** `?tur=`; none for "Tümü" */
  param: string | null;
  /** the API's `types` */
  types: string | undefined;
  count: (counts: MadrasahArchiveCountsResponse) => number;
}

export const ARCHIVE_TABS: readonly ArchiveTab[] = [
  { id: "all", param: null, types: undefined, count: (c) => c.all },
  { id: "course", param: "ders", types: "course", count: (c) => c.course },
  {
    id: "weeks",
    param: "hafta-celse",
    types: "week,session",
    count: (c) => c.week + c.session,
  },
  {
    id: "recordings",
    param: "kayit",
    types: "recording",
    count: (c) => c.recording,
  },
];

/** The tab a `?tur=` names; a value nobody knows is "Tümü". */
export const tabOf = (param: string | undefined): ArchiveTab =>
  ARCHIVE_TABS.find((tab) => tab.param !== null && tab.param === param) ??
  (ARCHIVE_TABS[0] as ArchiveTab);

/** The page a `?sayfa=` names: a whole number from 1, else the first. */
export function pageOf(param: string | undefined): number {
  const page = Number(param);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function archiveHref(
  madrasahId: string,
  tab: Pick<ArchiveTab, "param">,
  page: number
): string {
  const query = new URLSearchParams();
  if (tab.param) query.set("tur", tab.param);
  if (page > 1) query.set("sayfa", String(page));
  const search = query.toString();
  return `/medrese/${encodeURIComponent(madrasahId)}/arsiv${search ? `?${search}` : ""}`;
}

/** Where a page of a list stands: the items it shows, and whether there is a page either side. */
export function pageWindow(total: number, page: number, limit: number) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return { from, to, hasPrevious: page > 1, hasNext: to < total };
}

// ---- the rows --------------------------------------------------------------------

type Restore =
  | { kind: "button" }
  /** the caller's kademe is below the one that hid it: a sentence in place of the button */
  | { kind: "note"; text: string };

export interface ArchiveRow {
  key: string;
  /** the API's `type`, for the restore call */
  type: string;
  id: string;
  title: string;
  /** "Nûruosmaniye Köşkü · 12 hafta · 14 talebe" */
  context: string;
  /** a course shows its cover; the seed is its id */
  cover: string | null;
  typeLabel: string;
  typeIcon: IconName;
  hider: { name: string; role: string } | null;
  when: { label: string; iso: string };
  restore: Restore;
}

const TYPE_ICON: Readonly<Record<string, IconName>> = {
  course: "courses",
  week: "book",
  session: "calendar",
  recording: "video",
};

/**
 * When it was hidden, the way the canvas prints it: "Dün 10:40" for yesterday,
 * "Bugün …" for today, else "28 Eyl 16:10" (with the year when it is not this
 * one), all on the viewer's calendar and clock.
 */
export function whenLabel(
  at: Date,
  now: Date,
  where: { locale: string; timeZone: string },
  t: Messages
): string {
  const { locale, timeZone } = where;
  const day = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  const [year = 0, month = 1, date = 1] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, date - 1))
    .toISOString()
    .slice(0, 10);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
  if (day === today) return t("Archive.today", { time });
  if (day === yesterday) return t("Archive.yesterday", { time });
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** The role of whoever hid it, as words; a hider with no role is Medaris yönetimi. */
const roleWords = (role: string | null, t: Messages): string =>
  role === null
    ? t("Archive.byAdmin")
    : t.has(`Roles.${role}`)
      ? t(`Roles.${role}`)
      : "";

/**
 * 'Geri al', or why not (nazir 12, criterion 2): when the API says the caller
 * may not, the sentence names the kademe that hid it, in lower case after
 * "Bunu"; Medaris yönetimi keeps its capital, being a name.
 */
export function restoreOf(
  item: Pick<MadrasahArchiveItemResponse, "canRestore" | "archivedBy">,
  t: Messages,
  locale: string
): Restore {
  if (item.canRestore) return { kind: "button" };
  const by = item.archivedBy;
  if (!by) return { kind: "note", text: t("Archive.lockedUnknown") };
  if (by.role === null) return { kind: "note", text: t("Archive.lockedAdmin") };
  const role = roleWords(by.role, t);
  return {
    kind: "note",
    text: role
      ? t("Archive.locked", { role: role.toLocaleLowerCase(locale) })
      : t("Archive.lockedUnknown"),
  };
}

/** The line under an item's title: where it sits. */
function contextOf(
  item: MadrasahArchiveItemResponse,
  t: Messages,
  where: { locale: string; timeZone: string },
  now: Date
): string {
  const parts: Array<string | null> = [];
  switch (item.type) {
    case "course":
      parts.push(
        item.koskName,
        item.weekCount !== null
          ? t("Archive.weekCount", { count: item.weekCount })
          : null,
        item.studentCount !== null
          ? t("Archive.studentCount", { count: item.studentCount })
          : null
      );
      break;
    case "session":
      parts.push(
        item.courseTitle,
        item.weekNumber !== null
          ? t("Archive.weekNumber", { number: item.weekNumber })
          : null,
        item.scheduledAt
          ? whenLabel(new Date(item.scheduledAt), now, where, t)
          : null
      );
      break;
    default:
      parts.push(item.courseTitle);
  }
  return parts.filter(Boolean).join(" · ");
}

export function archiveRows(
  items: readonly MadrasahArchiveItemResponse[],
  t: Messages,
  where: { locale: string; timeZone: string; now: Date; viewerId?: string }
): ArchiveRow[] {
  return items.map((item) => {
    const by = item.archivedBy;
    const mine =
      by !== null &&
      where.viewerId !== undefined &&
      by.id.toLowerCase() === where.viewerId.toLowerCase();
    const role = by ? roleWords(by.role, t) : "";
    return {
      key: `${item.type}:${item.id}`,
      type: item.type,
      id: item.id,
      title: item.title,
      context: contextOf(item, t, where, where.now),
      cover: item.type === "course" ? item.id : null,
      typeLabel: t.has(`Archive.types.${item.type}`)
        ? t(`Archive.types.${item.type}`)
        : item.type,
      typeIcon: TYPE_ICON[item.type] ?? "archive",
      hider: by
        ? {
            name: by.name?.trim() || t("Nazirs.unknownPerson"),
            role: mine && role ? t("Archive.hiderYou", { role }) : role,
          }
        : null,
      when: {
        label: whenLabel(new Date(item.archivedAt), where.now, where, t),
        iso: new Date(item.archivedAt).toISOString(),
      },
      restore: restoreOf(item, t, where.locale),
    };
  });
}

/** The message key of a refused restore or hide, from the code the API answered with. */
export function archiveErrorKey(code: string): string {
  switch (code) {
    case "ARCHIVE_FORBIDDEN":
    // A lower level than the one that hid it (MDRS-135): the same words, "a higher level may have hidden it".
    case "ARCHIVE_RESTORE_LEVEL":
      return "Archive.errors.forbidden";
    case "ARCHIVE_ITEM_NOT_FOUND":
      return "Archive.errors.gone";
    case "ARCHIVE_PARENT_HIDDEN":
      return "Archive.errors.parentHidden";
    case "MADRASAH_ALREADY_HIDDEN":
      return "Archive.hide.already";
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    default:
      return "Problems.actionGeneric";
  }
}
