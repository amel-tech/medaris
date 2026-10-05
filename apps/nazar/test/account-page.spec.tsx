import { ToastProvider } from "@medaris/ui/mds/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildScopes } from "~/features/shell/scope";
import { assignment, course, medrese } from "./fixtures";
import { html, textOf, translatorFor } from "./server-render";

const state = {
  me: { timeZone: "Europe/Istanbul" } as { timeZone?: string } | null,
  groups: [] as unknown[] | null,
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/hesap",
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { idToken: "id-token" } }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => translatorFor(namespace),
  getLocale: async () => "tr",
}));
vi.mock("~/lib/keycloak-logout", () => ({ keycloakSignOut: vi.fn() }));
vi.mock("~/features/account/actions", () => ({
  updateTimeZone: vi.fn(async () => ({ success: true })),
}));
vi.mock("~/features/account/reads", () => ({
  getViewer: async () => state.me,
  getEffectivePermissions: async () => state.groups,
}));

const assignments = [
  medrese({
    id: "a-m",
    grantedAt: new Date("2026-09-01T09:00:00Z"),
    grantedBy: { id: "u", displayName: "Yusuf Ziya Ertuğrul" },
  }),
  assignment({
    id: "a-1",
    scopeId: "c-bina",
    scopeName: "Bina ve İzhar Şerhi",
    isImam: true,
    grantedBySelf: true,
    grantedAt: new Date("2026-09-01T09:00:00Z"),
    course: course(),
  }),
  assignment({
    id: "a-2",
    scopeId: "c-maksud",
    scopeName: "Maksûd şerhi",
    grantedBySelf: true,
    grantedAt: new Date("2026-10-01T09:00:00Z"),
    course: course({ status: "DRAFT" }),
  }),
  assignment({
    id: "a-3",
    scopeId: "c-meraha",
    scopeName: "Merâhu’l-ervâh okumaları",
    grantedBySelf: true,
    grantedAt: new Date("2026-09-01T09:00:00Z"),
    course: course({ hidden: true }),
  }),
];

const portal = (list = assignments, roles?: string[]) => ({
  status: "ok" as const,
  person: {
    name: "Mehmet Emin Işıkoğlu",
    email: "mehmetemin.isikoglu@example.com",
  },
  assignments: list,
  scopes: buildScopes(list),
  roles: roles ?? ["MEDRESE_BASMUDERRIS", "MUDERRIS"],
});

const render = async (p = portal()) => {
  const { AccountPage } = await import(
    "~/features/account/components/account-page"
  );
  const markup = await html(
    <ToastProvider>
      <AccountPage portal={p as never} />
    </ToastProvider>
  );
  return { markup, text: textOf(markup) };
};

beforeEach(() => {
  state.me = { timeZone: "Europe/Istanbul" };
  state.groups = [
    {
      role: "MUDERRIS",
      scopeType: "course",
      scopes: [
        { type: "course", id: "c-bina", name: "Bina ve İzhar Şerhi" },
        { type: "course", id: "c-maksud", name: "Maksûd şerhi" },
        { type: "course", id: "c-meraha", name: "Merâhu’l-ervâh okumaları" },
      ],
      permissions: ["course.edit", "session.manage", "user.lookup"],
    },
  ];
});

describe("Hesap ve ayarlar (nazir 20)", () => {
  it("has the title, the subtitle and the cards of the canvas", async () => {
    const { markup, text } = await render();
    expect(markup).toContain('<h1 class="mds-h1">Hesap ve ayarlar</h1>');
    expect(text).toContain(
      "Görevleriniz, izinleriniz, saat diliminiz ve diliniz."
    );
    for (const heading of [
      "Görevleriniz",
      "Etkin izinleriniz",
      "Saat ve dil",
      "Hesap",
    ]) {
      expect(markup, heading).toMatch(
        new RegExp(`<h2 class="mds-h3" id="[^"]+">${heading}</h2>`)
      );
    }
  });

  it("lists the roles as the server has them, without an 'open in the app' column", async () => {
    const { markup, text } = await render();
    expect(markup.match(/data-testid="assignment-role"/g)).toHaveLength(4);
    for (const header of ["Görev", "Kapsam", "Atayan", "Süre"]) {
      expect(markup).toMatch(new RegExp(`<th[^>]*>${header}</th>`));
    }
    expect(markup).not.toContain("Nazır’da aç");
    expect(text).toContain("Medrese başmüderrisi");
    expect(text).toContain("Süleymaniye Medresesi");
    expect(text).toContain("Yusuf Ziya Ertuğrul 1 Eylül 2026");
    expect(text).toContain("Kendiniz 1 Eylül 2026");
    expect(text).toContain("Süresiz");
  });

  it("badges the medrese 'Etkin' and each course by its state", async () => {
    const { markup } = await render();
    const badge = (label: string) =>
      new RegExp(
        `class="mds-badge[^"]*"[^>]*>(?:<svg[\\s\\S]*?</svg>)?${label}<`
      );
    expect(markup).toMatch(badge("Etkin"));
    expect(markup).toMatch(badge("Yayında"));
    expect(markup).toMatch(badge("Taslak"));
    expect(markup).toMatch(badge("Gizli"));
    expect(markup).toMatch(badge("Dersin imamı"));
  });

  it("dates in the zone saved on the profile", async () => {
    // 22:30 UTC on 1 Eylül is 01:30 on 2 Eylül in İstanbul; in New York it is still 1 Eylül.
    const late = [medrese({ grantedAt: new Date("2026-09-01T22:30:00Z") })];
    state.me = { timeZone: "Europe/Istanbul" };
    expect((await render(portal(late))).text).toContain("2 Eylül 2026");
    state.me = { timeZone: "America/New_York" };
    expect((await render(portal(late))).text).toContain("1 Eylül 2026");
  });

  it("falls back to İstanbul for a zone it does not know, and when the profile cannot be read", async () => {
    const late = [medrese({ grantedAt: new Date("2026-09-01T22:30:00Z") })];
    state.me = { timeZone: "Mars/Olympus_Mons" };
    expect((await render(portal(late))).text).toContain("2 Eylül 2026");
    state.me = null;
    const { text } = await render(portal(late));
    expect(text).toContain("2 Eylül 2026");
    expect(text).toContain("Saat diliminiz şu an okunamadı.");
  });

  it("says the person has no nazırlık only when they hold neither", async () => {
    const without = await render();
    expect(without.text).toContain(
      "Medrese nazırlığınız ya da ders nazırlığınız yok."
    );

    for (const role of ["MEDRESE_NAZIR", "DERS_NAZIR"]) {
      const withRole = await render(
        portal([...assignments, assignment({ id: "n", role })], [role])
      );
      expect(withRole.text).not.toContain("nazırlığınız yok");
    }
  });

  it("groups the permissions by role and scope, with the sentences, notes and the end of the role", async () => {
    const { markup, text } = await render();
    expect(markup.match(/data-testid="permission-group"/g)).toHaveLength(1);
    expect(text).toContain("Müderris olduğunuz derslerin her birinde geçerli");
    expect(text).toContain(
      "Dersi düzenle: başlık, tanıtım, müfredat, saat dilimi"
    );
    expect(text).toContain(
      "E-postayla kullanıcı bul Her arama denetim kaydına yazılır."
    );
    expect(text).toContain("Müderrisin varsayılan izinleri.");
    // three courses, none with an end date
    expect(text).toContain("Bitiş: süresiz.");
  });

  it("leaves a permission it has no sentence for out, never printing the code", async () => {
    state.groups = [
      {
        role: "MEDRESE_BASMUDERRIS",
        scopeType: "madrasah",
        scopes: [
          { type: "madrasah", id: "m-1", name: "Süleymaniye Medresesi" },
        ],
        permissions: ["madrasah.open_course"],
      },
    ];
    const { markup, text } = await render();
    expect(markup).not.toContain("madrasah.open_course");
    expect(markup).not.toContain('data-testid="permission-group"');
    expect(text).toContain(
      "Görevlerinizden gelen ya da size verilmiş bir izin henüz yok."
    );
  });

  it("says so inside its own card when the permissions could not be read, and the rest stays", async () => {
    state.groups = null;
    const { text } = await render();
    expect(text).toContain("Görevleriniz yüklenemedi");
    expect(text).toContain("Görevleriniz ve izinleriniz şu an okunamadı.");
    expect(text).toContain("Medrese başmüderrisi");
    expect(text).toContain("Saat ve dil");
  });

  it("has the time zone select with the saved zone, the help line and no save button", async () => {
    const { markup, text } = await render();
    expect(text).toContain("Saat dilimi");
    expect(text).toContain("İstanbul");
    expect(text).toContain(
      "Celse saatleri bu saat diliminde gösterilir. Seçtiğiniz an kaydedilir."
    );
    expect(markup).not.toMatch(/type="submit"/);
    expect(text).not.toContain("Kaydet");
  });

  it("opens the full list of zones at once for a zone the first list does not have", async () => {
    state.me = { timeZone: "Asia/Tokyo" };
    const { text } = await render();
    expect(text).toContain("Diğer…");
    expect(text).toContain("Diğer saat dilimleri");
    expect(text).toContain("Asia / Tokyo");
  });

  it("shows the language as read-only 'Türkçe'", async () => {
    const { markup, text } = await render();
    expect(text).toContain("Medaris şimdilik yalnız Türkçe görünür.");
    expect(markup).toMatch(
      /<input[^>]*readOnly=""[^>]*value="Türkçe"|<input[^>]*value="Türkçe"[^>]*readOnly=""/
    );
  });

  it("shows the account: the person, their roles and a read-only e-mail", async () => {
    const { markup, text } = await render();
    expect(text).toContain(
      "Mehmet Emin Işıkoğlu Medrese başmüderrisi · Müderris"
    );
    expect(text).toContain("E-posta");
    expect(markup).toMatch(
      /<input[^>]*value="mehmetemin\.isikoglu@example\.com"[^>]*>/
    );
    const input =
      /<input[^>]*value="mehmetemin\.isikoglu@example\.com"[^>]*>/.exec(
        markup
      )?.[0] ?? "";
    expect(input).toContain('readOnly=""');
    expect(input).toContain('dir="ltr"');
    expect(text).toContain(
      "Salt okunur. Hesabınıza kayıtlı adres; buradan değiştirilemez."
    );
  });

  it("ends the account column with the sign-out card and its sentence", async () => {
    const { markup, text } = await render();
    expect(text).toContain(
      "Bu tarayıcıda Medaris’ten çıkarsınız. Görevleriniz ve tercihleriniz hesabınızda kalır."
    );
    expect(markup).toMatch(
      /<button[^>]*>(?:<svg[\s\S]*?<\/svg>)?Çıkış yap<\/button>/
    );
    expect(markup.match(/Çıkış yap/g)).toHaveLength(1);
  });

  it("is a two-column grid on a wide screen", async () => {
    const { markup } = await render();
    expect(markup).toContain(
      "md:grid-cols-[minmax(0,1fr)_var(--layout-aside)]"
    );
  });
});
