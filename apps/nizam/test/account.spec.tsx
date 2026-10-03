import { resources } from "@medaris/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  allTimeZones,
  courseBadge,
  effectiveZone,
  expiryNote,
  FEATURED_TIME_ZONES,
  heldRoleKeys,
  needsFullList,
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
  roleApp,
  roleSummary,
  scopeMeta,
  visibleGroups,
} from "~/features/account/account-view";
import type { AccountData } from "~/features/account/reads";

// The permission codes the API can send (apps/tedrisat permission-catalog.ts).
const CATALOG = [
  "kosk.manage",
  "kosk.hosting",
  "course.open_standalone",
  "course.manage_all",
  "ban.manage_kosk",
  "deck.manage_kosk",
  "course_nazir.assign_kosk",
  "user.lookup",
  "course.edit",
  "session.manage",
  "session.live_link",
  "week.hide",
  "course.settings",
  "course.publish",
  "course.view_unpublished",
  "enrollment.decide",
  "enrollment.remove",
  "enrollment.complete",
  "recording.manage",
  "recording.upload",
  "recording.watch_restricted",
  "session.view_content",
  "ban.course",
  "ban.lift_course",
  "deck.manage_course",
  "course_nazir.assign",
  "permission_group.define",
];
const ROLES = [
  "MEDARIS_NAZIM",
  "KOSK_NAZIM",
  "MEDRESE_BASMUDERRIS",
  "MEDRESE_NAZIR",
  "MUDERRIS",
  "DERS_NAZIR",
];

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

vi.mock("~/env", () => ({
  env: { NAZIR_URL: "http://nazir.test/" },
}));
vi.mock("next-intl/server", () => {
  const t = (key: string, values?: Record<string, unknown>) => {
    const text = dig(resources.tr.nizam.AccountPage, key) as string;
    return Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      text
    );
  };
  t.has = (key: string) =>
    typeof dig(resources.tr.nizam.AccountPage, key) === "string";
  return {
    getTranslations: async () => t,
    getLocale: async () => "tr",
    getTimeZone: async () => "Europe/Istanbul",
  };
});
vi.mock("@medaris/ui/mds/toast", () => ({
  useToaster: () => ({ notify: () => "", dismiss: () => {} }),
}));
vi.mock("~/features/account/actions", () => ({ saveTimeZone: vi.fn() }));

describe("account messages (MDRS-179)", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a sentence for every permission code and a name for every role`, () => {
      const m = resources[locale].nizam.AccountPage as unknown as Record<
        | "permissions"
        | "roles"
        | "indefinite"
        | "permissionNotes"
        | "courseBadge"
        | "zones"
        | "columns",
        Record<string, string>
      >;
      for (const code of CATALOG) {
        expect(m.permissions[permissionMessageKey(code)], code).toBeTruthy();
      }
      for (const role of [...ROLES, "chief"]) {
        expect(m.roles[role], role).toBeTruthy();
      }
      for (const role of ROLES) {
        expect(m.indefinite[role], `indefinite.${role}`).toBeTruthy();
      }
      for (const code of PERMISSION_NOTE_CODES) {
        expect(
          m.permissionNotes[permissionMessageKey(code)],
          code
        ).toBeTruthy();
      }
      for (const state of ["published", "draft", "hidden"]) {
        expect(m.courseBadge[state]).toBeTruthy();
      }
      for (const zone of FEATURED_TIME_ZONES) {
        expect(m.zones[zone], zone).toBeTruthy();
      }
      for (const key of ["role", "scope", "grantor", "expires"]) {
        expect(m.columns[key], key).toBeTruthy();
      }
    });
  }
});

describe("roles and their order", () => {
  it("lists the widest role first; SYSTEM_ADMIN is the başnazım", () => {
    expect(
      heldRoleKeys(true, [
        { role: "MUDERRIS" },
        { role: "KOSK_NAZIM" },
        { role: "KOSK_NAZIM" },
      ] as never)
    ).toEqual(["chief", "KOSK_NAZIM", "MUDERRIS"]);
    expect(heldRoleKeys(false, [])).toEqual([]);
  });

  it("writes the first role as it is and the rest in lower case", () => {
    const label = (r: string) =>
      r === "KOSK_NAZIM" ? "Köşk nazımı" : "Müderris";
    expect(roleSummary(["KOSK_NAZIM", "MUDERRIS"], label, "tr")).toBe(
      "Köşk nazımı · müderris"
    );
  });

  it("sends köşk roles to Nizam and the rest to Nazır", () => {
    expect(roleApp("KOSK_NAZIM")).toBe("nizam");
    expect(roleApp("MEDARIS_NAZIM")).toBe("nizam");
    expect(roleApp("MUDERRIS")).toBe("nazir");
  });
});

describe("course badge and scope line", () => {
  it("badges a course: hidden beats published and draft", () => {
    const course = (status: string, hidden: boolean) =>
      ({ status, hidden }) as never;
    expect(courseBadge(course("PUBLISHED", false))).toBe("published");
    expect(courseBadge(course("DRAFT", false))).toBe("draft");
    expect(courseBadge(course("PUBLISHED", true))).toBe("hidden");
    expect(courseBadge(undefined)).toBeNull();
  });

  it("names the köşk, then the medrese, under a course", () => {
    expect(
      scopeMeta({
        course: {
          koskName: "Nûruosmaniye Köşkü",
          madrasahName: "Süleymaniye Medresesi",
        },
      } as never)
    ).toEqual(["Nûruosmaniye Köşkü", "Süleymaniye Medresesi"]);
    expect(scopeMeta({} as never)).toEqual([]);
  });
});

describe("the note about when permissions end (nizam/47 criterion 2)", () => {
  const end = new Date("2026-12-31T00:00:00Z");
  it("says an assignment with an end date ends the permissions by then", () => {
    expect(
      expiryNote("KOSK_NAZIM", [{ role: "KOSK_NAZIM", expiresAt: end }])
    ).toEqual({ kind: "ends", role: "KOSK_NAZIM", at: end });
  });

  it("takes the last end when every assignment of the role ends", () => {
    const later = new Date("2027-03-01T00:00:00Z");
    expect(
      expiryNote("MUDERRIS", [
        { role: "MUDERRIS", expiresAt: end },
        { role: "MUDERRIS", expiresAt: later },
      ])
    ).toMatchObject({ kind: "ends", at: later });
  });

  it("is 'indefinite' as soon as one assignment of the role has no end", () => {
    expect(
      expiryNote("MUDERRIS", [
        { role: "MUDERRIS", expiresAt: end },
        { role: "MUDERRIS", expiresAt: undefined },
      ])
    ).toEqual({ kind: "indefinite", role: "MUDERRIS" });
  });

  it("has no note for a grant without a role or a role not held", () => {
    expect(expiryNote(null, [])).toEqual({ kind: "none" });
    expect(
      expiryNote("MUDERRIS", [{ role: "KOSK_NAZIM", expiresAt: end }])
    ).toEqual({
      kind: "none",
    });
  });
});

describe("permission groups", () => {
  it("leaves out a code the page has no sentence for, and a group left empty", () => {
    const has = (key: string) => key === "permissions.kosk_manage";
    expect(
      visibleGroups(
        [
          {
            role: "KOSK_NAZIM",
            scopeType: "kosk",
            scopes: [],
            permissions: ["kosk.manage", "x.y"],
          },
          {
            role: "MUDERRIS",
            scopeType: "course",
            scopes: [],
            permissions: ["x.y"],
          },
        ] as never,
        has
      ).map((g) => g.permissions)
    ).toEqual([["kosk.manage"]]);
  });
});

describe("time zones (nizam/47)", () => {
  it("falls back to Istanbul when the profile has none", () => {
    expect(effectiveZone(undefined)).toBe("Europe/Istanbul");
    expect(effectiveZone("Europe/Berlin")).toBe("Europe/Berlin");
  });

  it("opens the full list only for a saved zone the short list does not name", () => {
    expect(needsFullList("Europe/Berlin")).toBe(false);
    expect(needsFullList("Asia/Tokyo")).toBe(true);
  });

  it("keeps the saved zone in the full list even when the runtime does not name it", () => {
    expect(allTimeZones("Mars/Olympus")[0]).toBe("Mars/Olympus");
    expect(allTimeZones("Europe/Berlin")).toContain("Europe/Berlin");
  });

  it("names the design's eight zones first", () => {
    expect(FEATURED_TIME_ZONES).toHaveLength(8);
    expect(FEATURED_TIME_ZONES[0]).toBe("Europe/Istanbul");
  });
});

const assignment = (over: Record<string, unknown>) => ({
  id: "a1",
  role: "KOSK_NAZIM",
  scopeType: "kosk",
  scopeId: "k-1",
  scopeName: "Üsküdar Köşkü",
  isImam: false,
  grantedAt: new Date("2026-09-12T09:00:00Z"),
  expiresAt: undefined,
  grantedBy: { id: "u2", displayName: "Yusuf Ziya Ertuğrul" },
  grantedBySelf: false,
  ...over,
});

const data = (over: Partial<AccountData> = {}): AccountData =>
  ({
    me: {
      id: "u1",
      email: "yusuf.ertugrul@example.com",
      emailVerified: true,
      givenName: "Yusuf Ziya",
      familyName: "Ertuğrul",
      timeZone: "Europe/Istanbul",
      roles: { systemAdmin: false, nazirOf: [], manages: [], teaches: [] },
    },
    systemAdmin: false,
    assignments: [],
    groups: [],
    ...over,
  }) as unknown as AccountData;

const render = async (d: AccountData) => {
  const { AccountPage } = await import(
    "~/features/account/components/account-page"
  );
  return renderToStaticMarkup(await AccountPage({ data: d, sessionName: "X" }));
};

describe("the page (nizam/47)", () => {
  it("shows the başnazım's row from the sign-in system, the köşk row with its end date and the sentences", async () => {
    const html = await render(
      data({
        systemAdmin: true,
        assignments: [
          assignment({
            grantedBySelf: true,
            expiresAt: new Date("2026-12-31T00:00:00Z"),
          }),
        ] as never,
        groups: [
          {
            role: "KOSK_NAZIM",
            scopeType: "kosk",
            scopes: [{ type: "kosk", id: "k-1", name: "Üsküdar Köşkü" }],
            permissions: ["kosk.manage", "user.lookup"],
          },
        ],
      })
    );
    expect(html).toContain("Hesap ve ayarlar");
    expect(html).toContain("Görevleriniz");
    expect(html).toContain("Medaris başnazımı");
    expect(html).toContain("Giriş sisteminde tanımlı");
    expect(html).toContain("Üsküdar Köşkü");
    expect(html).toContain("Kendiniz");
    expect(html).toContain("31 Aralık 2026 tarihine kadar");
    expect(html).toContain("Köşkü düzenle, gizle ya da geri al");
    expect(html).toContain("Her arama denetim kaydına yazılır.");
    expect(html).toContain(
      "Atamanız 31 Aralık 2026 tarihinde bittiği için izin de en geç o gün biter."
    );
    expect(html).toContain("Bütün izinler, her kapsamda.");
    expect(html).toContain("Medaris başnazımı · köşk nazımı");
  });

  it("shows the e-mail read-only, the time zone and the fixed language, and the sign-out button to the confirmation page", async () => {
    const html = await render(data());
    expect(html).toMatch(
      /<input[^>]*readOnly=""[^>]*value="yusuf.ertugrul@example.com"|<input[^>]*value="yusuf.ertugrul@example.com"[^>]*readonly=""/i
    );
    expect(html).toContain("Salt okunur.");
    expect(html).toContain("Saat dilimi");
    expect(html).toContain("İstanbul");
    expect(html).toContain("Medaris şimdilik yalnız Türkçe görünür.");
    expect(html).toMatch(
      /<a[^>]*href="\/tr\/auth\/signout"[^>]*>[\s\S]*Çıkış yap/
    );
  });

  it("says there are no roles for an account with none, and still draws the rest", async () => {
    const html = await render(data());
    expect(html).toContain("Henüz bir göreviniz yok.");
    expect(html).not.toContain("Etkin izinleriniz");
    expect(html).toContain("Çıkış yap");
  });

  it("gives a Medaris nazımı with no permission group an empty state and its own intro", async () => {
    const html = await render(
      data({ assignments: [assignment({ role: "MEDARIS_NAZIM" })] as never })
    );
    expect(html).toContain("Etkin izinleriniz");
    expect(html).toContain('data-testid="permissions-empty"');
    expect(html).toContain("Size ayrıca verilmiş bir izin grubu yok.");
    expect(html).toContain("İzinler görevinizden gelir.");
    expect(html).not.toContain("köşk nazımlığından gelen izni");
  });

  it("offers 'Nazır’da aç' only to a müderris, from the configured address", async () => {
    const without = await render(
      data({ assignments: [assignment({})] as never })
    );
    expect(without).not.toContain("Nazır’da aç");
    const html = await render(
      data({
        assignments: [
          assignment({
            id: "a2",
            role: "MUDERRIS",
            scopeType: "course",
            scopeName: "Emsile ve Bina",
          }),
        ] as never,
      })
    );
    expect(html).toContain("Müderrislik");
    expect(html).toMatch(
      /<a[^>]*href="http:\/\/nazir\.test"[^>]*>[\s\S]*Nazır’da aç/
    );
  });

  it("opens on the full zone list for a saved zone outside the short list", async () => {
    const html = await render(
      data({ me: { ...data().me, timeZone: "Asia/Tokyo" } as never })
    );
    expect(html).toContain("Tüm saat dilimleri");
  });
});
