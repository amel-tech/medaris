import type { IconName } from "@medaris/ui/mds/icon";
import { type Scope, type ScopeKind, scopeHref } from "./scope";

/**
 * The portal's menu per scope kind (nazir 21 for a medrese, 22 for a course),
 * as data. It is also the registry of the pages under a scope: the shared
 * placeholder page looks its segment up here, and a package that builds a
 * screen adds a static route folder that wins over the placeholder's
 * `[bolum]`, so the entry stays and only the page behind it changes.
 */
export type NavSectionId = "general" | "medrese" | "ders" | "management";

/** What an item's number is, and so what is read after it ("2 derste bekleyen başvuru"). */
export type CountSource =
  | "unread"
  | "coursesWithApplications"
  | "missingLinks"
  | "applications";

export type MenuCounts = Partial<Record<CountSource, number>>;

const COUNT_LABEL_KEY: Readonly<Record<CountSource, string>> = {
  unread: "countUnread",
  coursesWithApplications: "countCoursesWithApplications",
  missingLinks: "countMissingLinks",
  applications: "countApplications",
};

type NavTarget =
  | { type: "pano" }
  | { type: "global"; path: string }
  /** a page under the scope; `null` is the scope's own page */
  | { type: "scope"; segment: string | null };

interface NavEntry {
  id: string;
  icon: IconName;
  to: NavTarget;
  count?: CountSource;
}

interface NavSectionDef {
  id: NavSectionId;
  entries: readonly NavEntry[];
}

const GENERAL: NavSectionDef = {
  id: "general",
  entries: [
    { id: "pano", icon: "home", to: { type: "pano" } },
    {
      id: "notifications",
      icon: "bell",
      to: { type: "global", path: "/bildirimler" },
      count: "unread",
    },
  ],
};

const page = (segment: string | null): NavTarget => ({
  type: "scope",
  segment,
});

export const NAV: Readonly<Record<ScopeKind, readonly NavSectionDef[]>> = {
  medrese: [
    GENERAL,
    {
      id: "medrese",
      entries: [
        {
          id: "courses",
          icon: "courses",
          to: page("dersler"),
          count: "coursesWithApplications",
        },
        { id: "students", icon: "users", to: page("talebeler") },
        { id: "nazirs", icon: "shield", to: page("nazirlar") },
        { id: "bans", icon: "ban", to: page("yasaklamalar") },
        { id: "appeals", icon: "chats", to: page("itirazlar") },
        { id: "archive", icon: "archive", to: page("arsiv") },
      ],
    },
    {
      id: "management",
      entries: [
        { id: "rules", icon: "shieldCheck", to: page("kabul-kurallari") },
        { id: "settings", icon: "settings", to: page("ayarlar") },
      ],
    },
  ],
  ders: [
    GENERAL,
    {
      id: "ders",
      entries: [
        { id: "overview", icon: "book", to: page(null) },
        { id: "curriculum", icon: "edit", to: page("mufredat") },
        {
          id: "sessions",
          icon: "calendar",
          to: page("celseler"),
          count: "missingLinks",
        },
        {
          id: "students",
          icon: "users",
          to: page("talebeler"),
          count: "applications",
        },
        { id: "questions", icon: "chats", to: page("sorular") },
        { id: "recordings", icon: "video", to: page("kayitlar") },
        { id: "deck", icon: "cards", to: page("deste") },
        { id: "bans", icon: "ban", to: page("yasaklamalar") },
        { id: "archive", icon: "archive", to: page("arsiv") },
      ],
    },
    {
      id: "management",
      entries: [
        { id: "nazirs", icon: "shield", to: page("nazirlar") },
        { id: "settings", icon: "settings", to: page("ayarlar") },
      ],
    },
  ],
};

export interface NavItemView {
  id: string;
  href: string;
  icon: IconName;
  /** a key under `nazar.Nav`: `general.pano`, `medrese.courses`, `ders.sessions` */
  labelKey: string;
  /** only when it is above zero */
  count?: number;
  /** a key under `nazar.Shell` */
  countLabelKey?: string;
  /** matches its own address only; the scope's own page is a prefix of every page under it */
  exact: boolean;
}

export interface NavSectionView {
  id: NavSectionId;
  /** a key under `nazar.Nav.sections` */
  labelKey: string;
  items: NavItemView[];
}

/**
 * The menu of one scope with its numbers. A number that is missing, or zero,
 * leaves the item without one: a failed count is no badge, never an error.
 */
export function navFor(
  scope: Pick<Scope, "kind" | "id">,
  { panoHref, counts }: { panoHref: string; counts: MenuCounts }
): NavSectionView[] {
  const home = scopeHref(scope);
  return NAV[scope.kind].map((section) => ({
    id: section.id,
    labelKey: `sections.${section.id}`,
    items: section.entries.map((entry): NavItemView => {
      const href =
        entry.to.type === "pano"
          ? panoHref
          : entry.to.type === "global"
            ? entry.to.path
            : entry.to.segment === null
              ? home
              : `${home}/${entry.to.segment}`;
      const count = entry.count ? counts[entry.count] : undefined;
      return {
        id: entry.id,
        href,
        icon: entry.icon,
        labelKey:
          section.id === "general"
            ? `general.${entry.id}`
            : `${scope.kind}.${entry.id}`,
        count: count && count > 0 ? count : undefined,
        countLabelKey:
          entry.count && count && count > 0
            ? COUNT_LABEL_KEY[entry.count]
            : undefined,
        exact:
          entry.to.type === "pano" ||
          (entry.to.type === "scope" && entry.to.segment === null),
      };
    }),
  }));
}

/** What `activeItemId` reads of an item. */
interface Addressed {
  id: string;
  href: string;
  exact: boolean;
}

/**
 * The item the viewer is on: the longest matching address wins, and of two
 * equal addresses the later item (a course's Pano and its Genel bakış can be
 * the same page; the one in the course's own group is the one marked).
 */
export function activeItemId(
  sections: ReadonlyArray<{ items: readonly Addressed[] }>,
  pathname: string
): string | null {
  let best: { id: string; length: number } | null = null;
  for (const item of sections.flatMap((section) => section.items)) {
    const matches =
      pathname === item.href ||
      (!item.exact && pathname.startsWith(`${item.href}/`));
    if (matches && (!best || item.href.length >= best.length)) {
      best = { id: item.id, length: item.href.length };
    }
  }
  return best?.id ?? null;
}

/** A menu item with its words resolved: what the client component draws. */
export interface MenuItem extends Addressed {
  icon: IconName;
  label: string;
  count?: number;
  countLabel?: string;
}

export interface MenuSection {
  id: NavSectionId;
  label: string;
  items: MenuItem[];
}

/** `navFor` with its keys turned into words by two translators (`nazar.Nav` and `nazar.Shell`). */
export function labelNav(
  sections: readonly NavSectionView[],
  words: { nav: (key: string) => string; shell: (key: string) => string }
): MenuSection[] {
  return sections.map((section) => ({
    id: section.id,
    label: words.nav(section.labelKey),
    items: section.items.map((item) => ({
      id: item.id,
      href: item.href,
      exact: item.exact,
      icon: item.icon,
      label: words.nav(item.labelKey),
      count: item.count,
      countLabel: item.countLabelKey
        ? words.shell(item.countLabelKey)
        : undefined,
    })),
  }));
}

/**
 * The page's name for the phone bar: the menu item the viewer is on, else the
 * name given for an address outside the menu (`/hesap`), else the app's.
 */
export function pageTitle(
  sections: readonly MenuSection[],
  pathname: string,
  outside: ReadonlyArray<{ path: string; title: string }>,
  fallback: string
): string {
  const id = activeItemId(sections, pathname);
  const item = sections
    .flatMap((section) => section.items)
    .find((candidate) => candidate.id === id);
  if (item) return item.label;
  const named = outside.find(
    ({ path }) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return named?.title ?? fallback;
}

/** The entry behind a section segment (`/medrese/<id>/<segment>`), or null for a segment the portal has no page for. */
export function findSegment(
  kind: ScopeKind,
  segment: string
): { id: string; labelKey: string } | null {
  for (const section of NAV[kind]) {
    for (const entry of section.entries) {
      if (entry.to.type === "scope" && entry.to.segment === segment) {
        return { id: entry.id, labelKey: `${kind}.${entry.id}` };
      }
    }
  }
  return null;
}

/** Every segment of a kind, in menu order. */
export const sectionSegments = (kind: ScopeKind): string[] =>
  NAV[kind].flatMap((section) =>
    section.entries.flatMap((entry) =>
      entry.to.type === "scope" && entry.to.segment !== null
        ? [entry.to.segment]
        : []
    )
  );
