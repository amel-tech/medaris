import type { NotificationResponse } from "@medaris/services/tedrisat";
import type { IconName } from "@medaris/ui/mds/icon";

/**
 * Everything the Bildirimler page decides without a browser (nizam 37, 46,
 * MDRS-179): how a stored notification reads, where it leads, which day group
 * it sits in, which chips filter it. The API stores a type and flat params,
 * never a sentence, so the words come from `nizam.NotificationsPage.types`.
 */

type Values = Record<string, string | number>;
/** next-intl's translator, reduced to what this module calls. */
export type Translate = (key: string, values?: Values) => string;

/** The types this build words; any other type reads as a plain "Bildirim". */
const ICONS: Record<string, IconName> = {
  COURSE_BAN_PLACED: "ban",
  KOSK_BAN_PLACED: "ban",
};

const PLACEHOLDERS = [
  "actorName",
  "talebeName",
  "courseTitle",
  "koskName",
  "reason",
] as const;

export const notificationIcon = (type: string): IconName =>
  ICONS[type] ?? "bell";

/**
 * The chips of "Bildirim türü". Only kinds the API can produce are drawn:
 * the designs also show device, course, appeal and deck chips whose events
 * have no model yet, and a chip that can never match would only promise them.
 */
export const TYPE_FILTERS = ["all", "bans"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/**
 * Every type this app words. The caller's tedris-side notifications (an
 * enrollment approved, a session moved) live in the same table but are not
 * nizam's: "Tümü", the tab counts, the bell and the badge all ask for these
 * types only, so they never count or draw a row this page cannot word.
 */
export const NIZAM_TYPES: string[] = Object.keys(ICONS);

const FILTER_TYPES: Record<TypeFilter, string[]> = {
  all: NIZAM_TYPES,
  bans: ["COURSE_BAN_PLACED", "KOSK_BAN_PLACED"],
};

/** The `types` query of a chip; "Tümü" is every type nizam words. */
export const typesOf = (filter: TypeFilter): string[] => FILTER_TYPES[filter];

const text = (
  params: NotificationResponse["params"],
  key: string
): string | null => {
  const value = params[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
};

/**
 * Where the notification leads, as an app path; null when it leads nowhere.
 * Built only from the UUID the API validated, never from free text.
 */
export const notificationHref = (n: NotificationResponse): string | null => {
  if (!n.targetId) return null;
  switch (n.type) {
    case "COURSE_BAN_PLACED":
    case "KOSK_BAN_PLACED":
      return n.targetType === "KOSK"
        ? `/kosks/${n.targetId}/yasaklamalar`
        : null;
    default:
      return null;
  }
};

export interface DescribeContext {
  t: Translate;
}

export interface NotificationText {
  title: string;
  body: string;
  /** Who or where it came from ("Nûruosmaniye Köşkü"), if the producer said. */
  source: string | null;
}

/**
 * The title and sentence of a notification. A type this build does not know
 * (a newer server) reads as a plain "Bildirim" with no body, never as a raw
 * key.
 */
export const describeNotification = (
  n: NotificationResponse,
  { t }: DescribeContext
): NotificationText => {
  const source = text(n.params, "source");
  if (!(n.type in ICONS)) return { title: t("unknownTitle"), body: "", source };

  const values: Values = {};
  for (const [key, value] of Object.entries(n.params)) {
    if (typeof value === "string" || typeof value === "number") {
      values[key] = value;
    }
  }
  // An ICU placeholder with no value makes the whole message fail.
  for (const key of PLACEHOLDERS) values[key] ??= "";
  const base = `types.${n.type}`;
  // A köşk ban without a köşk name keeps the wording that needs none.
  const anyKosk =
    n.type === "KOSK_BAN_PLACED" && !text(n.params, "koskName")
      ? "AnyKosk"
      : "";
  const bodyKey = `${text(n.params, "reason") ? "bodyReason" : "body"}${anyKosk}`;
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
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
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

/** The clock for today and yesterday, day, month and clock for older rows ("29 Eyl 21:10"). */
export const formatRowTime = (
  createdAt: Date,
  group: DayGroupKey,
  locale: string,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(
    locale,
    group === "earlier"
      ? {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZone,
        }
      : { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }
  ).format(createdAt);

/** The bell's accessible name (canvas rule 10): the count is not drawn, so it is said. */
export const bellLabel = (
  unread: number,
  t: { plain: string; unread: (count: number) => string }
): string => (unread > 0 ? t.unread(unread) : t.plain);
