import { resources } from "@medaris/i18n";
import type { AssignmentResponse } from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { landingFor, taskRows } from "~/features/assignments/landing";

const dig = (node: unknown, path: string) =>
  path
    .split(".")
    .reduce<unknown>((n, part) => (n as Record<string, unknown>)?.[part], node);

let chiefName: string | null = null;
let sessionEmail: string | null = null;
vi.mock("~/features/assignments/reads", () => ({
  getChiefNazimName: async () => chiefName,
}));
vi.mock("~/lib/auth_options", () => ({
  auth: async () => (sessionEmail ? { user: { email: sessionEmail } } : null),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => {
    const [, ...rest] = ns.split(".");
    const base = dig(resources.tr.nizam, rest.join("."));
    return (key: string, values?: Record<string, unknown>) =>
      Object.entries(values ?? {}).reduce(
        (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
        dig(base, key) as string
      );
  },
}));

const a = (over: Record<string, unknown>): AssignmentResponse =>
  ({
    id: "a",
    role: "MUDERRIS",
    scopeType: "course",
    scopeId: "c",
    scopeName: "Bina ve İzhar Şerhi",
    isImam: false,
    grantedAt: new Date(),
    expiresAt: null,
    grantedBy: { id: "u", displayName: null },
    grantedBySelf: false,
    ...over,
  }) as unknown as AssignmentResponse;

const course = (status: string, studentCount: number) => ({
  status,
  hidden: false,
  koskId: "k",
  koskName: "Nûruosmaniye Köşkü",
  madrasahId: null,
  madrasahName: null,
  studentCount,
});

describe("landingFor (nizam 04)", () => {
  it("keeps a nazım, SYSTEM_ADMIN and a person with no role where they are", () => {
    expect(
      landingFor({ systemAdmin: false, assignments: [{ role: "KOSK_NAZIM" }] })
    ).toBe("nizam");
    expect(landingFor({ systemAdmin: true, assignments: [] })).toBe("nizam");
    expect(landingFor({ systemAdmin: false, assignments: [] })).toBe("none");
  });

  it("sends someone with only medrese and course roles to Nazar", () => {
    expect(
      landingFor({
        systemAdmin: false,
        assignments: [{ role: "MUDERRIS" }, { role: "MEDRESE_BASMUDERRIS" }],
      })
    ).toBe("nazar");
  });

  it("a köşk nazım who also teaches stays in Nizam", () => {
    expect(
      landingFor({
        systemAdmin: false,
        assignments: [{ role: "MUDERRIS" }, { role: "KOSK_NAZIM" }],
      })
    ).toBe("nizam");
  });
});

describe("taskRows", () => {
  it("lists medrese roles first, then courses, and leaves Nizam's own roles out", () => {
    const rows = taskRows([
      a({ id: "1", course: course("PUBLISHED", 35), isImam: true }),
      a({
        id: "2",
        role: "MEDRESE_BASMUDERRIS",
        scopeType: "madrasah",
        scopeName: "Süleymaniye Medresesi",
      }),
      a({ id: "3", role: "KOSK_NAZIM", scopeType: "kosk" }),
    ]);
    expect(rows.map((r) => [r.id, r.kind])).toEqual([
      ["2", "madrasah"],
      ["1", "course"],
    ]);
  });

  it("shows no talebe count for a draft", () => {
    const [draft, live] = taskRows([
      a({ id: "d", course: course("DRAFT", 0) }),
      a({ id: "l", course: course("PUBLISHED", 24) }),
    ]);
    expect(draft).toMatchObject({ draft: true, studentCount: null });
    expect(live).toMatchObject({ draft: false, studentCount: 24 });
  });
});

describe("NazarRedirectPage", () => {
  const render = async (props: Record<string, unknown>) => {
    const { NazarRedirectPage } = await import(
      "~/features/assignments/components/nazar-redirect-page"
    );
    return renderToStaticMarkup(
      await NazarRedirectPage({
        rows: [],
        nazarUrl: "http://nazar.test",
        failed: false,
        retryHref: "/en/nazar-yonlendirme",
        ...props,
      } as never)
    );
  };

  it("words the rows as the design does and links to Nazar", async () => {
    const html = await render({
      rows: taskRows([
        a({
          id: "m",
          role: "MEDRESE_BASMUDERRIS",
          scopeType: "madrasah",
          scopeName: "Süleymaniye Medresesi",
        }),
        a({ id: "1", isImam: true, course: course("PUBLISHED", 35) }),
        a({
          id: "2",
          scopeName: "Maksûd şerhi",
          isImam: true,
          course: course("DRAFT", 0),
        }),
      ]),
    });
    expect(html).toContain("Medrese ve ders işleriniz Nazar’da");
    expect(html).toContain("Medrese başmüderrisi");
    expect(html).toContain("Müderris · Nûruosmaniye Köşkü · 35 talebe");
    expect(html).toContain("Dersin imamı");
    expect(html).toContain("Taslak");
    expect(html).not.toContain("0 talebe");
    expect(html).toContain('href="http://nazar.test"');
    expect(html).toContain("Nazar’a git");
    expect((html.match(/data-testid="task-row"/g) ?? []).length).toBe(3);
  });

  it("offers a retry when the roles could not be read, and no empty claim", async () => {
    const html = await render({ rows: null, failed: true });
    expect(html).toContain("Görevleriniz yüklenemedi");
    expect(html).toContain('href="/en/nazar-yonlendirme"');
    expect(html).not.toContain("henüz");
  });

  it("leaves the button out without a Nazar address", async () => {
    const html = await render({ nazarUrl: null });
    expect(html).not.toContain("Nazar’a git");
  });
});

describe("NoAccess (nizam 06)", () => {
  const render = async () => {
    const { NoAccess } = await import("~/components/errors/no-access");
    return renderToStaticMarkup(await NoAccess({ locale: "tr" }));
  };

  it("names the başnazım, shows the session e-mail and links home", async () => {
    chiefName = "Yusuf Ziya Ertuğrul";
    sessionEmail = "h.gundogdu@example.com";
    const html = await render();
    expect(html).toContain("Bu bölüm için izniniz yok");
    expect(html).toContain(
      "gerekirse şu kişiden isteyin: Yusuf Ziya Ertuğrul."
    );
    expect(html).toContain("h.gundogdu@example.com");
    expect(html).toContain('href="/tr"');
    expect(html).toContain("Ana sayfaya dön");
  });

  it("is not the screen for a path no page answers (MDRS-211)", async () => {
    const { PageNotFound } = await import("~/components/errors/page-not-found");
    const html = renderToStaticMarkup(await PageNotFound({ locale: "tr" }));
    expect(html).toContain("Sayfa bulunamadı");
    expect(html).toContain("Bu adreste bir sayfa yok.");
    expect(html).toContain('href="/tr"');
    expect(html).toContain("Ana sayfaya dön");
    expect(html).not.toContain("izniniz yok");
    expect(html).not.toContain("başnazım");
  });

  it("falls back to the general sentence when no name is known", async () => {
    chiefName = null;
    sessionEmail = null;
    const html = await render();
    expect(html).toContain("gerekirse ondan isteyin.");
    expect(html).not.toContain("Giriş yaptığınız hesap");
  });
});
