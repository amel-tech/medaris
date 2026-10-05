import { ToastProvider } from "@medaris/ui/mds/toast";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildScopes } from "~/features/shell/scope";
import { assignment, course, medrese } from "./fixtures";
import { html, textOf, translatorFor } from "./server-render";

let pathname = "/medrese/m-1";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => translatorFor(namespace),
}));

const person = { name: "Mehmet Emin Işıkoğlu", email: "mehmet@example.com" };
const bina = assignment({
  scopeId: "c-bina",
  scopeName: "Bina ve İzhar Şerhi",
  isImam: true,
  course: course(),
});
const mantik = assignment({
  scopeId: "c-mantik",
  scopeName: "İsâgûcî ile mantığa giriş",
  course: course({ koskName: "Fatih Köşkü" }),
});

const renderFrame = async (props: {
  assignments: ReturnType<typeof assignment>[];
  current: number | null;
  roles?: string[];
  counts?: Record<string, number>;
}) => {
  const { PortalFrame } = await import(
    "~/features/shell/components/portal-frame"
  );
  const scopes = buildScopes(props.assignments);
  const markup = await html(
    <ToastProvider>
      <PortalFrame
        person={person}
        roles={props.roles ?? ["MEDRESE_BASMUDERRIS", "MUDERRIS"]}
        scopes={scopes}
        current={
          props.current === null ? null : (scopes[props.current] ?? null)
        }
        counts={props.counts}
      >
        <p>içerik</p>
      </PortalFrame>
    </ToastProvider>
  );
  return { markup, text: textOf(markup) };
};

const sidebarOf = (markup: string) =>
  /<aside[\s\S]*?<\/aside>/.exec(markup)?.[0] ?? "";

/** The opening tags of the anchors to `href`, whatever order their attributes come in (`next/link` writes href last). */
const anchorsTo = (markup: string, href: string) =>
  [...markup.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`href="${href}"`));

beforeEach(() => {
  pathname = "/medrese/m-1";
});

describe("the shell of a medrese (nazir 21)", () => {
  const frame = () =>
    renderFrame({
      assignments: [medrese(), bina, mantik],
      current: 0,
      counts: { unread: 3, coursesWithApplications: 2 },
    });

  it("is the sidebar, the phone bar and the main, with the page inside", async () => {
    const { markup } = await frame();
    expect(markup).toContain("<aside");
    expect(markup).toContain('class="mds-appbar"');
    expect(markup).toMatch(/<main[^>]*data-density="compact"/);
    expect(markup).toContain("<p>içerik</p>");
  });

  it("lists the menu in the order of the canvas, with the badges", async () => {
    const { markup } = await frame();
    const aside = sidebarOf(markup);
    expect(aside).toContain('<nav aria-label="Ana menü"');
    const labels = [
      ...aside.matchAll(
        /class="mds-nav-(?:section|item)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+)/g
      ),
    ].map((m) => m[1]?.trim());
    expect(labels).toEqual([
      "Genel",
      "Pano",
      "Bildirimler",
      "Medrese",
      "Dersler",
      "Talebeler",
      "Medrese nazırları",
      "Yasaklamalar",
      "İtirazlar",
      "Arşiv",
      "Yönetim",
      "Kabul kuralları",
      "Medrese ayarları",
    ]);
    // Dersler carries the courses with an application, Bildirimler the unread.
    expect(aside).toMatch(
      /Dersler<span class="mds-nav-item__count">2<span class="mds-visually-hidden"> derste bekleyen başvuru<\/span>/
    );
    expect(aside).toMatch(
      /Bildirimler<span class="mds-nav-item__count">3<span class="mds-visually-hidden"> okunmamış<\/span>/
    );
    expect(aside).not.toContain("Celseler");
  });

  it("puts the theme toggle in the sidebar's brand row and in the phone bar", async () => {
    const { markup } = await frame();
    const toggle = /aria-label="Koyu temaya geç"/g;
    expect(sidebarOf(markup).match(toggle)).toHaveLength(1);
    expect(markup.match(toggle)).toHaveLength(2);
  });

  it("marks the page the viewer is on, once", async () => {
    pathname = "/medrese/m-1/dersler";
    const { markup } = await frame();
    const current = [...sidebarOf(markup).matchAll(/aria-current="page"/g)];
    expect(current).toHaveLength(1);
    expect(anchorsTo(sidebarOf(markup), "/medrese/m-1/dersler")[0]).toContain(
      'aria-current="page"'
    );
  });

  it("ends in the person, who is a link to the account page, and has no sign-out", async () => {
    const { markup, text } = await frame();
    const aside = sidebarOf(markup);
    expect(aside).toMatch(/<a class="mds-nav-user" href="\/hesap"/);
    expect(textOf(aside)).toContain(
      "Mehmet Emin Işıkoğlu Medrese başmüderrisi · Müderris , ayarlar"
    );
    expect(text).not.toContain("Çıkış yap");
  });

  it("names the page and the bell on the phone bar, and the bell has no visible number", async () => {
    pathname = "/medrese/m-1/dersler";
    const { markup } = await frame();
    const bar =
      /<header class="mds-appbar">[\s\S]*?<\/header>/.exec(markup)?.[0] ?? "";
    expect(bar).toContain(
      '<p class="mds-appbar__title" dir="auto">Dersler</p>'
    );
    expect(
      anchorsTo(bar, "/bildirimler").some((tag) =>
        tag.includes('aria-label="Bildirimler, 3 okunmamış"')
      )
    ).toBe(true);
    expect(textOf(bar)).not.toMatch(/\b3\b/);
  });

  it("names the bell plainly when nothing is unread", async () => {
    const { markup } = await renderFrame({
      assignments: [medrese(), bina],
      current: 0,
    });
    expect(
      anchorsTo(markup, "/bildirimler").some((tag) =>
        tag.includes('aria-label="Bildirimler"')
      )
    ).toBe(true);
  });

  it("titles the phone bar with the account page's name outside the menu", async () => {
    pathname = "/hesap";
    const { markup } = await frame();
    expect(markup).toContain('dir="auto">Hesap ve ayarlar</p>');
  });
});

describe("the shell of a course (nazir 22)", () => {
  const frame = () =>
    renderFrame({
      assignments: [medrese(), bina, mantik],
      current: 1,
      roles: ["MUDERRIS"],
      counts: { unread: 3, missingLinks: 1, applications: 2 },
    });

  it("lists the course's menu, not the medrese's", async () => {
    pathname = "/ders/c-bina";
    const { markup } = await frame();
    const aside = sidebarOf(markup);
    const labels = [
      ...aside.matchAll(
        /class="mds-nav-(?:section|item)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?([^<]+)/g
      ),
    ].map((m) => m[1]?.trim());
    expect(labels).toEqual([
      "Genel",
      "Pano",
      "Bildirimler",
      "Ders",
      "Genel bakış",
      "Müfredat",
      "Celseler",
      "Talebeler",
      "Sorular",
      "Ders kayıtları",
      "Ders destesi",
      "Yasaklamalar",
      "Arşiv",
      "Yönetim",
      "Ders nazırları",
      "Ders ayarları",
    ]);
    expect(aside).not.toContain("Kabul kuralları");
    expect(aside).toMatch(
      /Celseler<span class="mds-nav-item__count">1<span class="mds-visually-hidden"> bağlantısı eksik/
    );
    expect(aside).toMatch(
      /Talebeler<span class="mds-nav-item__count">2<span class="mds-visually-hidden"> bekleyen başvuru/
    );
    expect(anchorsTo(aside, "/ders/c-bina")[0]).toContain(
      'aria-current="page"'
    );
  });

  it("opens the medrese's Pano from Pano", async () => {
    const { markup } = await frame();
    expect(sidebarOf(markup)).toMatch(
      /href="\/medrese\/m-1"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Pano/
    );
  });

  it("leaves the person's row with the course roles only", async () => {
    const { markup } = await frame();
    expect(textOf(sidebarOf(markup))).toContain("Müderris , ayarlar");
  });
});

describe("the closed scope picker", () => {
  it("is a button that names the scope it would change from, with several scopes", async () => {
    const { markup } = await renderFrame({
      assignments: [medrese(), bina],
      current: 0,
    });
    const aside = sidebarOf(markup);
    expect(aside).toMatch(
      /<button[^>]*aria-haspopup="menu"[^>]*aria-label="Kapsam değiştir: Süleymaniye Medresesi"/
    );
    expect(textOf(aside)).toContain(
      "Süleymaniye Medresesi Medrese başmüderrisi"
    );
    // closed: no list in the page yet
    expect(markup).not.toContain(
      "Yalnız görev aldığınız medrese ve dersler listelenir."
    );
  });

  it("shows a course by its role and imam, without the köşk", async () => {
    pathname = "/ders/c-bina";
    const { markup } = await renderFrame({
      assignments: [medrese(), bina],
      current: 1,
    });
    const text = textOf(sidebarOf(markup));
    expect(text).toContain("Bina ve İzhar Şerhi Müderris · dersin imamı");
    expect(text).not.toContain("Nûruosmaniye");
  });

  it("is not a control when there is one scope", async () => {
    const { markup } = await renderFrame({
      assignments: [medrese()],
      current: 0,
    });
    const aside = sidebarOf(markup);
    expect(aside).not.toContain("aria-haspopup");
    expect(aside).not.toContain("Kapsam değiştir");
    expect(textOf(aside)).toContain(
      "Süleymaniye Medresesi Medrese başmüderrisi"
    );
  });
});

describe("the shell before there is a scope (nazir 02)", () => {
  it("is the brand and the person, with no menu and no picker", async () => {
    const { markup, text } = await renderFrame({
      assignments: [],
      current: null,
      roles: [],
    });
    const aside = sidebarOf(markup);
    expect(aside).not.toContain("<nav");
    expect(aside).not.toContain("aria-haspopup");
    expect(aside).toContain("Medaris");
    expect(text).toContain("Talebe");
    // the person is text, not a way to the account page
    expect(aside).not.toMatch(/<a [^>]*mds-nav-user/);
    expect(aside).toContain('<div class="mds-nav-user hover:bg-transparent">');
    expect(textOf(aside)).not.toContain("ayarlar");
    // nothing to open on the phone either
    expect(markup).not.toMatch(/href="\/bildirimler"/);
  });

  it("names a role the person holds elsewhere instead of calling them Talebe", async () => {
    const { markup } = await renderFrame({
      assignments: [],
      current: null,
      roles: ["KOSK_NAZIM"],
    });
    expect(textOf(sidebarOf(markup))).toContain("Köşk nazımı");
    expect(textOf(sidebarOf(markup))).not.toContain("Talebe");
  });
});
