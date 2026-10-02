import type { IconName } from "@medaris/ui/mds/icon";

/**
 * What the Nizam shell shows, per the role of whoever is signed in (nizam
 * 50, 51, 52 and the desktop sidebar of every screen): pure data, no React
 * and no I/O, so the menus the designs draw can be pinned by plain specs.
 * The sidebar and the phone sheet are the same nav (canvas rule 18).
 */
/** Where the logo goes: the locale root, the one page every visitor can open (MDRS-101). */
export const homeHref = "/";

export type ShellVariant =
  | "chief" // Medaris başnazımı: the realm's SYSTEM_ADMIN
  | "medaris" // Medaris nazımı
  | "kosk" // köşk nazımı
  | "none"; // no management role: the "Yönetim yetkiniz yok" screen

/** The slice of the caller's roles the variant is decided from. */
export interface ShellRoles {
  systemAdmin: boolean;
  assignments: { role: string }[];
}

/** The widest role wins: a başnazım who also manages a köşk gets the başnazım's menu. */
export function shellVariant(me: ShellRoles | null): ShellVariant {
  if (!me) return "none";
  if (me.systemAdmin) return "chief";
  const roles = new Set(me.assignments.map((a) => a.role));
  if (roles.has("MEDARIS_NAZIM")) return "medaris";
  if (roles.has("KOSK_NAZIM")) return "kosk";
  return "none";
}

/** Where a path points, before the locale: `:kosk` is the köşk in scope. */
export interface NavEntry {
  id: string;
  /** i18n key under `nizam.Shell.items` */
  label: string;
  path: string;
  icon: IconName;
  /** the badge, when a number is known; read as "{count} {countLabel}" */
  countKey?: "notifications" | "applications";
  countLabel?: string;
}

export interface NavGroup {
  /** i18n key under `nizam.Shell.groups` */
  id:
    | "general"
    | "platform"
    | "requests"
    | "audit"
    | "settings"
    | "kosk"
    | "manage";
  items: NavEntry[];
}

const general: NavGroup = {
  id: "general",
  items: [
    { id: "home", label: "home", path: "/", icon: "home" },
    {
      id: "notifications",
      label: "notifications",
      path: "/bildirimler",
      icon: "bell",
      countKey: "notifications",
      countLabel: "unread",
    },
  ],
};

const chiefGroups: NavGroup[] = [
  general,
  {
    id: "platform",
    items: [
      {
        id: "madrasahs",
        label: "madrasahs",
        path: "/medreseler",
        icon: "medrese",
      },
      { id: "kosks", label: "kosks", path: "/kosks", icon: "kosk" },
      {
        id: "nazims",
        label: "nazims",
        path: "/medaris-nazimlari",
        icon: "shieldCheck",
      },
      { id: "grants", label: "grants", path: "/izin-gruplari", icon: "key" },
      {
        id: "inactive",
        label: "inactive",
        path: "/pasif-kapsamlar",
        icon: "warning",
      },
    ],
  },
  {
    id: "requests",
    items: [
      {
        id: "kosk-applications",
        label: "koskApplications",
        path: "/talepler/kosk-basvurulari",
        icon: "inbox",
      },
      {
        id: "deck-requests",
        label: "deckRequests",
        path: "/talepler/deste-yayin-istekleri",
        icon: "cards",
      },
      {
        id: "appeals",
        label: "appeals",
        path: "/talepler/itirazlar",
        icon: "chats",
      },
      {
        id: "permanent-bans",
        label: "permanentBans",
        path: "/talepler/kalici-yasak",
        icon: "ban",
      },
    ],
  },
  {
    id: "audit",
    items: [
      { id: "bans", label: "bans", path: "/yasaklamalar", icon: "ban" },
      {
        id: "audit-log",
        label: "auditLog",
        path: "/denetim-kaydi",
        icon: "doc",
      },
      { id: "archive", label: "archive", path: "/arsiv", icon: "archive" },
    ],
  },
  {
    id: "settings",
    items: [
      {
        id: "youtube",
        label: "youtube",
        path: "/ayarlar/youtube",
        icon: "video",
      },
      {
        id: "platform-settings",
        label: "platformSettings",
        path: "/ayarlar/platform",
        icon: "settings",
      },
    ],
  },
];

/** The chief's group `id`, kept to the entries named; the lesser menus are cut from the chief's. */
const chiefOnly = (id: NavGroup["id"], keep: string[]): NavGroup => ({
  id,
  items: (chiefGroups.find((g) => g.id === id)?.items ?? []).filter((i) =>
    keep.includes(i.id)
  ),
});

/** The başnazım's menu less what is the başnazım's alone (nizam 51). */
const medarisGroups: NavGroup[] = [
  general,
  chiefOnly("platform", ["madrasahs", "kosks"]),
  chiefOnly("requests", [
    "kosk-applications",
    "deck-requests",
    "permanent-bans",
  ]),
  chiefOnly("audit", ["bans"]),
];

const koskGroups: NavGroup[] = [
  general,
  {
    id: "kosk",
    items: [
      {
        id: "courses",
        label: "courses",
        path: "/kosks/:kosk/dersler",
        icon: "courses",
      },
      {
        id: "sessions",
        label: "sessions",
        path: "/kosks/:kosk/celseler",
        icon: "calendar",
      },
      {
        id: "students",
        label: "students",
        path: "/kosks/:kosk/talebeler",
        icon: "users",
      },
      {
        id: "applications",
        label: "applications",
        path: "/kosks/:kosk/basvurular",
        icon: "inbox",
        countKey: "applications",
        countLabel: "pending",
      },
      {
        id: "course-requests",
        label: "courseRequests",
        path: "/kosks/:kosk/ders-talepleri",
        icon: "edit",
      },
      {
        id: "enrollments",
        label: "enrollments",
        path: "/kosks/:kosk/ders-kayitlari",
        icon: "video",
      },
      {
        id: "decks",
        label: "decks",
        // the decks page that exists today; the köşk's own list (nizam/53) replaces it
        path: "/decks",
        icon: "cards",
      },
      {
        id: "bans",
        label: "bans",
        path: "/kosks/:kosk/yasaklamalar",
        icon: "ban",
      },
      {
        id: "archive",
        label: "archive",
        path: "/kosks/:kosk/arsiv",
        icon: "archive",
      },
    ],
  },
  {
    id: "manage",
    items: [
      {
        id: "permissions",
        label: "permissions",
        path: "/kosks/:kosk/izinler",
        icon: "key",
      },
      {
        id: "kosk-settings",
        label: "koskSettings",
        path: "/kosks/:kosk/ayarlar",
        icon: "settings",
      },
    ],
  },
];

/** The groups of a variant's nav, in the order of its canvas; none has no nav. */
export function navGroups(variant: ShellVariant): NavGroup[] {
  switch (variant) {
    case "chief":
      return chiefGroups;
    case "medaris":
      return medarisGroups;
    case "kosk":
      return koskGroups;
    default:
      return [];
  }
}

/** The role line under the person's name: the widest role they hold, or the talebe's. */
export function roleLabelKey(
  variant: ShellVariant,
  me: ShellRoles | null
):
  | "chief"
  | "medaris"
  | "kosk"
  | "MEDRESE_BASMUDERRIS"
  | "MEDRESE_NAZIR"
  | "MUDERRIS"
  | "DERS_NAZIR"
  | "student" {
  if (variant === "chief" || variant === "medaris" || variant === "kosk") {
    return variant;
  }
  const held = me?.assignments.map((a) => a.role) ?? [];
  for (const role of [
    "MEDRESE_BASMUDERRIS",
    "MEDRESE_NAZIR",
    "MUDERRIS",
    "DERS_NAZIR",
  ] as const) {
    if (held.includes(role)) return role;
  }
  return "student";
}

/** The köşk whose menu is shown: the one in the path if the viewer manages it, else the first. */
export function currentKoskId(
  pathname: string,
  koskIds: string[]
): string | null {
  const inPath = /\/kosks\/([^/]+)/.exec(pathname)?.[1];
  if (inPath && koskIds.includes(inPath)) return inPath;
  return koskIds[0] ?? null;
}

/** The auth pages (sign-in, sign-out, the error page) are the whole screen: a signed-in person on them gets no shell around. */
export const isBarePath = (current: string): boolean =>
  /^\/auth(\/|$)/.test(current);

/** `/tr/kosks/abc/basvurular` and `/kosks/abc/basvurular` are the same page. */
export function stripLocale(
  pathname: string,
  locales: readonly string[]
): string {
  const first = pathname.split("/")[1];
  if (first && locales.includes(first)) {
    return pathname.slice(first.length + 1) || "/";
  }
  return pathname || "/";
}

/** Whether `href` is the page, or the section the page belongs to; "/" matches only itself. */
export function isActive(path: string, current: string): boolean {
  if (path === "/") return current === "/";
  const clean = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);
  const [a, b] = [clean(path), clean(current)];
  return b === a || b.startsWith(`${a}/`);
}

/** Whether a path inside the köşk's page is the most specific entry for it (`/kosks/:kosk` is the page of the nazım's köşk and would match every sibling). */
export function activeEntryId(
  entries: { id: string; path: string }[],
  current: string
): string | null {
  let best: { id: string; len: number } | null = null;
  for (const e of entries) {
    if (isActive(e.path, current) && (!best || e.path.length > best.len)) {
      best = { id: e.id, len: e.path.length };
    }
  }
  return best?.id ?? null;
}

/**
 * A course's roster, `/kosks/:id/courses/:courseId/students`, is the köşk's
 * Talebeler (nizam 57 draws that item selected); the nav's own path for it is
 * the köşk-wide list.
 */
export function studentsPathAlias(current: string): string {
  const m = /^\/kosks\/([^/]+)\/courses\/[^/]+\/students\/?$/.exec(current);
  if (m) return `/kosks/${m[1]}/talebeler`;
  // A course's own pages (overview nizam/53, editor) are the köşk's Dersler.
  const course = /^\/kosks\/([^/]+)\/courses(\/|$)/.exec(current);
  return course ? `/kosks/${course[1]}/dersler` : current;
}
