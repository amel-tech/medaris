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

  it("sends someone with only medrese and course roles to Nazır", () => {
    expect(
      landingFor({
        systemAdmin: false,
        assignments: [{ role: "MUDERRIS" }, { role: "MEDRESE_BASMUDERRIS" }],
      })
    ).toBe("nazir");
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

describe("NazirRedirectPage", () => {
  const render = async (props: Record<string, unknown>) => {
    const { NazirRedirectPage } = await import(
      "~/features/assignments/components/nazir-redirect-page"
    );
    return renderToStaticMarkup(
      await NazirRedirectPage({
        rows: [],
        nazirUrl: "http://nazir.test",
        failed: false,
        retryHref: "/en/nazir-yonlendirme",
        ...props,
      } as never)
    );
  };

  it("words the rows as the design does and links to Nazır", async () => {
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
    expect(html).toContain("Medrese ve ders işleriniz Nazır’da");
    expect(html).toContain("Medrese başmüderrisi");
    expect(html).toContain("Müderris · Nûruosmaniye Köşkü · 35 talebe");
    expect(html).toContain("Dersin imamı");
    expect(html).toContain("Taslak");
    expect(html).not.toContain("0 talebe");
    expect(html).toContain('href="http://nazir.test"');
    expect(html).toContain("Nazır’a git");
    expect((html.match(/data-testid="task-row"/g) ?? []).length).toBe(3);
  });

  it("offers a retry when the roles could not be read, and no empty claim", async () => {
    const html = await render({ rows: null, failed: true });
    expect(html).toContain("Görevleriniz yüklenemedi");
    expect(html).toContain('href="/en/nazir-yonlendirme"');
    expect(html).not.toContain("henüz");
  });

  it("leaves the button out without a Nazır address", async () => {
    const html = await render({ nazirUrl: null });
    expect(html).not.toContain("Nazır’a git");
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

  it("falls back to the general sentence when no name is known", async () => {
    chiefName = null;
    sessionEmail = null;
    const html = await render();
    expect(html).toContain("gerekirse ondan isteyin.");
    expect(html).not.toContain("Giriş yaptığınız hesap");
  });
});
