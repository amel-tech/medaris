import { resources } from "@medaris/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  courseBadge,
  openUrl,
  roleApp,
  scopeMeta,
} from "~/features/account/assignment-view";
import {
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
} from "~/features/account/permission-notes";

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
  "question.answer",
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

const messages = (locale: "tr" | "en" | "ar") =>
  resources[locale].tedris.AccountPage as Record<
    "permissions" | "roles" | "permissionNotes" | "courseBadge",
    Record<string, string>
  >;

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

let currentRoles: unknown = null;
vi.mock("~/features/account/reads", () => ({
  getAccountRoles: async () => currentRoles,
}));
vi.mock("~/env", () => ({
  env: { NIZAM_URL: "http://nizam.test", NAZAR_URL: "http://nazir.test/" },
}));
vi.mock("next-intl/server", () => {
  const t = (key: string, values?: Record<string, unknown>) => {
    const text = dig(resources.tr.tedris.AccountPage, key) as string;
    return Object.entries(values ?? {}).reduce(
      (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
      text
    );
  };
  t.has = (key: string) =>
    typeof dig(resources.tr.tedris.AccountPage, key) === "string";
  return {
    getTranslations: async () => t,
    getLocale: async () => "tr",
    getTimeZone: async () => "Europe/Istanbul",
  };
});

describe("account messages (MDRS-169)", () => {
  for (const locale of ["tr", "en", "ar"] as const) {
    it(`${locale} has a sentence for every permission code and a name for every role`, () => {
      const m = messages(locale);
      for (const code of CATALOG) {
        expect(m.permissions[permissionMessageKey(code)], code).toBeTruthy();
      }
      for (const role of ROLES) expect(m.roles[role], role).toBeTruthy();
      for (const code of PERMISSION_NOTE_CODES) {
        expect(
          m.permissionNotes[permissionMessageKey(code)],
          code
        ).toBeTruthy();
      }
      for (const state of ["published", "draft", "hidden"]) {
        expect(m.courseBadge[state]).toBeTruthy();
      }
    });
  }
});

describe("assignment view helpers", () => {
  it("sends köşk roles to Nizam and the rest to Nazır", () => {
    expect(roleApp("KOSK_NAZIM")).toBe("nizam");
    expect(roleApp("MEDARIS_NAZIM")).toBe("nizam");
    expect(roleApp("MUDERRIS")).toBe("nazir");
    expect(roleApp("MEDRESE_BASMUDERRIS")).toBe("nazir");
  });

  it("badges a course: hidden beats published and draft", () => {
    const course = (status: string, hidden: boolean) =>
      ({ status, hidden }) as never;
    expect(courseBadge(course("PUBLISHED", false))).toBe("published");
    expect(courseBadge(course("DRAFT", false))).toBe("draft");
    expect(courseBadge(course("PUBLISHED", true))).toBe("hidden");
    expect(courseBadge(undefined)).toBeNull();
  });

  it("opens a köşk in Nizam with the köşk id, and leaves the link out without an address", () => {
    const urls = { nizam: "http://nizam.test/", nazir: "http://nazir.test" };
    expect(
      openUrl({ role: "KOSK_NAZIM", scopeType: "kosk", scopeId: "k-1" }, urls)
    ).toBe("http://nizam.test/kosks/k-1");
    expect(
      openUrl({ role: "MUDERRIS", scopeType: "course", scopeId: "c-1" }, urls)
    ).toBe("http://nazir.test");
    expect(
      openUrl(
        { role: "MEDRESE_NAZIR", scopeType: "madrasah", scopeId: "m" },
        urls
      )
    ).toBe("http://nazir.test");
    expect(
      openUrl({ role: "KOSK_NAZIM", scopeType: "kosk", scopeId: "k" }, {})
    ).toBeNull();
  });

  it("names the köşk, then the medrese, under a course", () => {
    expect(
      scopeMeta({
        scopeType: "course",
        course: {
          koskName: "Nûruosmaniye Köşkü",
          madrasahName: "Süleymaniye Medresesi",
        },
      } as never)
    ).toEqual(["Nûruosmaniye Köşkü", "Süleymaniye Medresesi"]);
    expect(scopeMeta({ scopeType: "kosk" } as never)).toEqual([]);
  });
});

const assignment = (over: Record<string, unknown>) => ({
  id: "a1",
  role: "KOSK_NAZIM",
  scopeType: "kosk",
  scopeId: "k-1",
  scopeName: "Nûruosmaniye Köşkü",
  isImam: false,
  grantedAt: "2026-08-25T09:00:00Z",
  expiresAt: null,
  grantedBy: { id: "u2", displayName: "Yusuf Ziya Ertuğrul" },
  grantedBySelf: false,
  ...over,
});

const render = async () => {
  const { RolesSection } = await import(
    "~/features/account/components/roles-section"
  );
  return renderToStaticMarkup(await RolesSection());
};

describe("RolesSection", () => {
  beforeEach(() => {
    currentRoles = null;
  });

  it("is absent for someone with no role", async () => {
    currentRoles = { assignments: [], groups: [] };
    expect(await render()).toBe("");
  });

  it("says so, in the section, when the roles cannot be read", async () => {
    currentRoles = null;
    const html = await render();
    expect(html).toContain("Görevlerin yüklenemedi");
  });

  it("lists each role with scope, badge, grantor, date, term and the right button", async () => {
    currentRoles = {
      assignments: [
        assignment({}),
        assignment({
          id: "a2",
          role: "MUDERRIS",
          scopeType: "course",
          scopeId: "c-1",
          scopeName: "Emsile ve Bina",
          isImam: true,
          grantedBySelf: true,
          course: {
            status: "PUBLISHED",
            hidden: false,
            koskId: "k-1",
            koskName: "Nûruosmaniye Köşkü",
            madrasahId: null,
            madrasahName: null,
            studentCount: 3,
          },
        }),
        assignment({
          id: "a3",
          role: "MUDERRIS",
          scopeType: "course",
          scopeId: "c-2",
          scopeName: "Maksûd okumaları",
          course: {
            status: "PUBLISHED",
            hidden: true,
            koskId: "k-1",
            koskName: "Nûruosmaniye Köşkü",
            madrasahId: null,
            madrasahName: null,
            studentCount: 0,
          },
        }),
      ],
      groups: [
        {
          role: "KOSK_NAZIM",
          scopeType: "kosk",
          scopes: [{ type: "kosk", id: "k-1", name: "Nûruosmaniye Köşkü" }],
          permissions: ["kosk.manage", "user.lookup"],
        },
        {
          role: "MUDERRIS",
          scopeType: "course",
          scopes: [
            { type: "course", id: "c-1", name: "Emsile ve Bina" },
            { type: "course", id: "c-2", name: "Maksûd okumaları" },
          ],
          permissions: ["course.edit"],
        },
      ],
    };
    const html = await render();

    expect(html).toContain("Görevlerin ve izinlerin");
    expect(html).toContain("Yusuf Ziya Ertuğrul");
    expect(html).toContain("25 Ağustos 2026");
    expect(html).toContain("Kendin");
    expect(html).toContain("Süresiz");
    expect(html).toContain("Yayında");
    expect(html).toContain("Gizli");
    expect(html).toContain("İmam");
    expect(html).toContain('href="http://nizam.test/kosks/k-1"');
    expect(html).toContain('href="http://nazir.test"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("Nizam’da aç: köşk nazımı, Nûruosmaniye Köşkü");
    expect(html).toContain("Nazır’da aç: müderris, Emsile ve Bina");

    expect(html).toContain("Nûruosmaniye Köşkü · köşk nazımı");
    expect(html).not.toContain("mds-badge--success");
    expect(html).toContain('<hr class="mds-separator"');
    expect(html).toContain("Köşkü düzenle, gizle ya da geri al");
    expect(html).toContain("Her arama denetim kaydına yazılır.");
    expect(html).toContain(
      "Müderris olduğun derslerin her birinde geçerli: Emsile ve Bina ve Maksûd okumaları."
    );
    expect(html).toContain(
      "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
    );
    // a sentence for a permission the caller does not hold is not there
    expect(html).not.toContain("Dersi yayımla ya da taslağa çek");
    expect((html.match(/data-testid="assignment-role"/g) ?? []).length).toBe(3);
  });
});
