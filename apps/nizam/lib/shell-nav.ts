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

/**
 * A köşk nazımı's Ana sayfa is their köşk's (nizam 02): it sits in the köşk's
 * path so the menu and the scope picker stay on that köşk.
 */
const koskGeneral: NavGroup = {
  id: "general",
  items: [
    {
      id: "home",
      label: "home",
      path: "/kosks/:kosk/ana-sayfa",
      icon: "home",
    },
    ...general.items.filter((item) => item.id !== "home"),
  ],
};

/**
 * The köşk's menu (nizam 52) holds only pages that exist. The design also
 * draws Celseler, Talebeler and Ders kayıtları for the whole köşk; those are
 * later-phase screens with no route yet, so they stay out of the menu until
 * they are built rather than answer 404 (MDRS-211). A course's own sessions
 * and roster are reached from the course.
 */
const koskGroups: NavGroup[] = [
  koskGeneral,
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
        id: "decks",
        label: "decks",
        path: "/kosks/:kosk/desteler",
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

/**
 * The platform permissions behind a Medaris nazımı's menu items (nizam 05: "İzni
 * olmayan menü öğeleri DOM'da bulunmaz"). An item that is not listed is open to
 * every nazım: the home page, the bell and the account are no one's gift.
 */
const ITEM_PERMISSIONS: Record<string, readonly string[]> = {
  // Exactly the codes `GET /madrasahs/directory` opens to (MDRS-108): the ones
  // the page acts on. A nazır grant has no row there, so it shows no item.
  madrasahs: [
    "platform.madrasah_create",
    "platform.head_muderris_manage",
    "platform.madrasah_edit",
  ],
  kosks: [
    "platform.kosk_create",
    "platform.kosk_nazim_manage",
    "platform.kosk_edit",
    "platform.hosting_grant",
  ],
  "kosk-applications": ["platform.kosk_application_decide"],
  "deck-requests": ["platform.deck_publish"],
  appeals: ["platform.appeal_decide"],
  "permanent-bans": ["platform.ban_account"],
  bans: ["platform.ban_scoped", "platform.ban_account"],
  "audit-log": ["platform.audit_read"],
  inactive: ["platform.inactive_scopes_manage"],
  youtube: ["platform.youtube_manage"],
  "platform-settings": ["platform.policy_edit"],
};

/**
 * A Medaris nazımı's groups cut to what their permissions open; a group left
 * with no item goes. `held` is `null` when the permissions could not be read:
 * then nothing is hidden, and tedrisat refuses what is not theirs.
 */
export function filterByPermissions(
  groups: NavGroup[],
  held: ReadonlySet<string> | null
): NavGroup[] {
  if (!held) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const needs = ITEM_PERMISSIONS[item.id];
        return !needs || needs.some((code) => held.has(code));
      }),
    }))
    .filter((group) => group.items.length > 0);
}

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
 * A course's pages (overview nizam/53, editor, Celseler nizam/56, Talebeler
 * nizam/57) are the köşk's Dersler: the köşk-wide Celseler and Talebeler are
 * not in the menu yet (MDRS-211), so Dersler is drawn selected.
 */
export function coursePathAlias(current: string): string {
  const course = /^\/kosks\/([^/]+)\/courses(\/|$)/.exec(current);
  return course ? `/kosks/${course[1]}/dersler` : current;
}
