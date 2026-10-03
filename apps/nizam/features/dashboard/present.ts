import type {
  DashboardPendingTotalsResponse,
  GrantResponse,
  KoskDashboardSessionResponse,
} from "@medaris/services/tedrisat";
import { platformOf } from "../kosks/overview-present";

/**
 * Pure helpers behind the three home pages (nizam 01, 02 and 05, MDRS-182): the
 * greeting's number, "Bugün 08:45", the state of a celse row and what its
 * button says, the cards of "İzinleriniz" and the footnote under them. No React
 * and no I/O, so the sentences and rules the designs show can be pinned by
 * plain specs.
 */
export type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

// ---- the greeting -----------------------------------------------------------

/**
 * How many requests wait for the viewer's decision: the sections they are
 * shown, added up (nizam/01: 3 + 2 + 2 + 2; nizam/05 shows three of the four
 * and says 7). A section that is not theirs is `null` and adds nothing.
 */
export function pendingTotal(totals: DashboardPendingTotalsResponse): number {
  return [
    totals.koskApplications,
    totals.deckPublishRequests,
    totals.appeals,
    totals.permanentBanRequests,
  ].reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

// ---- moments ----------------------------------------------------------------

export interface Zone {
  locale: string;
  timeZone: string;
}

const dayKey = (date: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
};

const clock = (date: Date, { locale, timeZone }: Zone): string =>
  new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);

/**
 * "Bugün 08:45", "Dün 16:30", "29 Eyl 14:20": when a request came, in the
 * viewer's zone. Today and yesterday are named; older days are dated.
 */
export function momentLabel(
  at: Date | string,
  now: Date,
  zone: Zone,
  words: { today: string; yesterday: string }
): string {
  const date = new Date(at);
  const days = Math.round(
    (dayKey(now, zone.timeZone) - dayKey(date, zone.timeZone)) / 86_400_000
  );
  if (days === 0) return `${words.today} ${clock(date, zone)}`;
  if (days === 1) return `${words.yesterday} ${clock(date, zone)}`;
  const day = new Intl.DateTimeFormat(zone.locale, {
    timeZone: zone.timeZone,
    day: "numeric",
    month: "short",
  }).format(date);
  return `${day} ${clock(date, zone)}`;
}

/** "3 Eki Cmt 21:00": a celse's time in the table. */
export function sessionWhen(at: Date | string, zone: Zone): string {
  return new Intl.DateTimeFormat(zone.locale, {
    timeZone: zone.timeZone,
    day: "numeric",
    month: "short",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

/** "3 Ekim Cumartesi 21:00": a celse's time in a sentence. */
export function sessionWhenLong(at: Date | string, zone: Zone): string {
  return new Intl.DateTimeFormat(zone.locale, {
    timeZone: zone.timeZone,
    day: "numeric",
    month: "long",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at));
}

// ---- the celse table --------------------------------------------------------

export type SessionState = "missingLink" | "planned" | "cancelled" | "past";

/** What the Durum column says: a celse that is over or cancelled says so; one ahead with no link is "Bağlantı eksik". */
export function sessionState(
  s: Pick<
    KoskDashboardSessionResponse,
    "cancelled" | "meetingUrl" | "scheduledAt"
  >,
  now: Date
): SessionState {
  if (s.cancelled) return "cancelled";
  if (new Date(s.scheduledAt).getTime() < now.getTime()) return "past";
  return s.meetingUrl ? "planned" : "missingLink";
}

export type SessionAction = "addLink" | "edit" | "view";

/** The button of a row: add the missing link, edit what is planned, look at what is over. */
export function sessionAction(state: SessionState): SessionAction {
  if (state === "missingLink") return "addLink";
  return state === "planned" ? "edit" : "view";
}

export interface PlatformView {
  /** the `PlatformChip` key, or "other" for a host the chip does not know */
  platform: string;
  host?: string;
}

/** Where the celse meets, read off its link; null when it has none. */
export function platformView(
  url: string | null | undefined
): PlatformView | null {
  const name = platformOf(url);
  if (!name) return null;
  if (name === "Zoom") return { platform: "zoom" };
  if (name === "Google Meet") return { platform: "google-meet" };
  return { platform: "other", host: name };
}

/** "Hafta 5", "Hafta 5, telafi celsesi": the first line under a course. */
export function weekLine(
  s: Pick<KoskDashboardSessionResponse, "weekNumber" | "isMakeup">,
  words: { week: (n: number) => string; makeup: string }
): string {
  const week = words.week(s.weekNumber);
  return s.isMakeup ? `${week}, ${words.makeup}` : week;
}

/** The müderrisler of a celse as the row prints them: "Ad, imam", the others plain. */
export function muderrisLine(
  muderris: { name: string; isImam: boolean }[],
  imam: string
): string {
  return muderris
    .map((m) => (m.isImam ? `${m.name}, ${imam}` : m.name))
    .join(" · ");
}

/** Whose avatar initials a row wears: the first letters of the first two words. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

// ---- "İzinleriniz" ----------------------------------------------------------

export interface GrantCard {
  id: string;
  kind: "group" | "permission";
  /** the group's name, or the permission's code */
  name: string;
  /** a group's codes; one code for a single permission */
  codes: string[];
  expiresAt: Date | null;
  grantedAt: Date;
  grantedBy: string | null;
}

/**
 * The cards under "İzinleriniz": what the başnazım gave the viewer at the
 * platform, groups first, each in the order it was given. A grant held in a
 * köşk or a course is not the platform's and is left out.
 */
export function grantCards(grants: readonly GrantResponse[]): GrantCard[] {
  const cards = grants
    .filter((g) => g.scopeType === "platform")
    .flatMap((g): GrantCard[] => {
      const base = {
        id: g.id,
        expiresAt: g.expiresAt ? new Date(g.expiresAt) : null,
        grantedAt: new Date(g.grantedAt),
        grantedBy: g.grantedBy.displayName ?? null,
      };
      if (g.group) {
        return [
          {
            ...base,
            kind: "group",
            name: g.group.name,
            codes: [...g.group.permissions],
          },
        ];
      }
      return g.permission
        ? [
            {
              ...base,
              kind: "permission",
              name: g.permission,
              codes: [g.permission],
            },
          ]
        : [];
    });
  const order = (c: GrantCard) => (c.kind === "group" ? 0 : 1);
  return cards.sort(
    (a, b) =>
      order(a) - order(b) || a.grantedAt.getTime() - b.grantedAt.getTime()
  );
}

export interface FootnoteParts {
  /** "Medaris başnazımı Yusuf Ziya Ertuğrul": who gave them */
  givers: string[];
  /** the day most were given, `null` when no card carries a date */
  commonDay: string | null;
  /** the cards given on another day than most, with the day */
  others: { card: GrantCard; day: string }[];
}

/**
 * The dipnot under the cards: who gave the permissions and when. Most were
 * given on one day; a card given on another is named with its own day
 * ("Platformdan yasakla izni 30 Eylül 2026'da, ötekiler 14 Eylül 2026'da").
 */
export function footnoteParts(
  cards: readonly GrantCard[],
  formatDay: (date: Date) => string
): FootnoteParts {
  const givers = [
    ...new Set(cards.flatMap((c) => (c.grantedBy ? [c.grantedBy] : []))),
  ];
  const byDay = new Map<string, GrantCard[]>();
  for (const card of cards) {
    const day = formatDay(card.grantedAt);
    byDay.set(day, [...(byDay.get(day) ?? []), card]);
  }
  let commonDay: string | null = null;
  let most = 0;
  for (const [day, list] of byDay) {
    if (list.length > most) {
      most = list.length;
      commonDay = day;
    }
  }
  const others = [...byDay]
    .filter(([day]) => day !== commonDay)
    .flatMap(([day, list]) => list.map((card) => ({ card, day })));
  return { givers, commonDay, others };
}
