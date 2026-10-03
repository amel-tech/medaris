import type { NotificationResponse } from "@medaris/services/tedrisat";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Everything the notifications page decides without a browser: how a stored
 * notification reads, where it leads, which day group it sits in. The API
 * stores a type and flat params (MDRS-167), never a sentence, so the words
 * come from `tedris.NotificationsPage.types` in the reader's language.
 */

type Params = NotificationResponse["params"];
type Values = Record<string, string | number>;
/** next-intl's translator, reduced to what this module calls. */
export type Translate = (key: string, values?: Values) => string;

const ICONS: Record<string, IconName> = {
  ENROLLMENT_APPROVED: "check",
  ENROLLMENT_REJECTED: "close",
  REMOVED_FROM_COURSE: "ban",
  COURSE_ACCESS_REMOVED: "lock",
  SESSION_RESCHEDULED: "clock",
  SESSION_CANCELLED: "close",
  SESSION_ADDED: "video",
  KOSK_APPLICATION_RESULT: "kosk",
  DECK_PUBLISH_RESULT: "cards",
};

const PLACEHOLDERS = [
  "courseTitle",
  "koskName",
  "deckTitle",
  "sessionLabel",
  "sessionAt",
  "makeupAt",
  "previousAt",
  "reason",
] as const;

export const notificationIcon = (type: string): IconName =>
  ICONS[type] ?? "bell";

const text = (params: Params, key: string): string | null => {
  const value = params[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
};

/**
 * Where the notification leads, as an app path; null when it leads nowhere
 * (no target, or a session whose course is not in `params`). A path from
 * stored values is built only from UUIDs the API validated, never from free
 * text.
 */
export const notificationHref = (n: NotificationResponse): string | null => {
  if (!n.targetId) return null;
  switch (n.targetType) {
    case "COURSE":
      return `/courses/${n.targetId}`;
    case "SESSION": {
      const courseId = text(n.params, "courseId");
      return courseId ? `/courses/${courseId}/lessons/${n.targetId}` : null;
    }
    case "DECK":
      return `/decks/${n.targetId}`;
    case "KOSK":
      return `/kosks/${n.targetId}`;
    default:
      return null;
  }
};

/** "Paz 4 Ekim 20:00": weekday, day, month and clock, in `timeZone`. */
export const formatSessionTime = (
  iso: string,
  locale: string,
  timeZone: string
): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("hour")}:${part("minute")}`;
};

export interface DescribeContext {
  t: Translate;
  locale: string;
  timeZone: string;
}

export interface NotificationText {
  title: string;
  body: string;
  /** Who or where it came from ("Beyazıt Köşkü"), if the producer said. */
  source: string | null;
}

/**
 * The title and sentence of a notification. A type this build does not know
 * (a newer server) reads as a plain "Bildirim" with no body, never as a raw
 * key.
 */
export const describeNotification = (
  n: NotificationResponse,
  { t, locale, timeZone }: DescribeContext
): NotificationText => {
  const source = text(n.params, "source");
  const known = n.type in ICONS;
  if (!known) return { title: t("unknownTitle"), body: "", source };

  const when = (key: string) => {
    const iso = text(n.params, key);
    return iso ? formatSessionTime(iso, locale, timeZone) : null;
  };
  const values: Values = {};
  for (const [key, value] of Object.entries(n.params)) {
    if (typeof value === "string" || typeof value === "number") {
      values[key] = value;
    }
  }
  for (const key of ["sessionAt", "makeupAt", "previousAt"]) {
    const formatted = when(key);
    if (formatted) values[key] = formatted;
  }
  // An ICU placeholder with no value makes the whole message fail, so every
  // name a sentence uses has one; a missing `outcome` reads as the cautious
  // "other" branch.
  for (const key of PLACEHOLDERS) values[key] ??= "";
  values.outcome ??= "other";
  const base = `types.${n.type}`;
  const has = (key: string) => Boolean(text(n.params, key));

  let bodyKey = "body";
  switch (n.type) {
    case "SESSION_CANCELLED":
      if (has("makeupAt")) bodyKey = "bodyMakeup";
      break;
    case "SESSION_RESCHEDULED":
      if (has("previousAt")) bodyKey = "bodyPrevious";
      break;
    case "SESSION_ADDED":
      if (!has("sessionLabel")) bodyKey = "bodyNoSession";
      break;
    case "ENROLLMENT_REJECTED":
    case "REMOVED_FROM_COURSE":
    case "KOSK_APPLICATION_RESULT":
      if (has("reason")) bodyKey = "bodyReason";
      break;
    case "DECK_PUBLISH_RESULT":
      if (has("reason")) bodyKey = "bodyReason";
      break;
  }
  return {
    title: t(`${base}.title`, values),
    body: t(`${base}.${bodyKey}`, values),
    source,
  };
};

export type DayGroupKey = "today" | "yesterday" | "earlier";

const dayKey = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

/** The calendar day before `key` (YYYY-MM-DD); date arithmetic, not 24 hours, so a DST day is not off by one. */
const previousDay = (key: string): string => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

export const dayGroupOf = (
  createdAt: string,
  now: string,
  timeZone: string
): DayGroupKey => {
  const day = dayKey(new Date(createdAt), timeZone);
  const today = dayKey(new Date(now), timeZone);
  if (day === today) return "today";
  if (day === previousDay(today)) return "yesterday";
  return "earlier";
};

export interface DayGroup {
  key: DayGroupKey;
  items: NotificationResponse[];
}

/** BUGÜN / DÜN / DAHA ÖNCE, in that order, each keeping the list's own order; empty groups are left out. */
export const groupByDay = (
  items: NotificationResponse[],
  now: string,
  timeZone: string
): DayGroup[] => {
  const groups: Record<DayGroupKey, NotificationResponse[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const n of items) {
    groups[dayGroupOf(n.createdAt.toISOString(), now, timeZone)].push(n);
  }
  return (["today", "yesterday", "earlier"] as const)
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, items: groups[key] }));
};

/** The clock for today and yesterday, the date for older rows. */
export const formatRowTime = (
  createdAt: Date,
  group: DayGroupKey,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(
    locale,
    group === "earlier"
      ? { day: "numeric", month: "long", timeZone }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }
  ).format(createdAt);

/** The bell's accessible name (canvas rule 10): the count is not drawn, so it is said. */
export const bellLabel = (unread: number, t: Translate): string =>
  unread > 0 ? t("labelUnread", { count: unread }) : t("label");
