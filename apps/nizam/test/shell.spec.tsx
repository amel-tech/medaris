import { resources } from "@medaris/i18n";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as { user: { name: string; email: string } } | null,
  me: null as {
    systemAdmin: boolean;
    assignments: { role: string }[];
  } | null,
  kosks: [] as { id: string; name: string }[],
  pending: {} as Record<string, number>,
  unread: 0,
  pathname: "/tr",
  permissions: null as string[] | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations:
    async (namespace: string) =>
    (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        [...namespace.split("."), ...key.split(".")].reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)?.[part],
          resources.tr
        ) as string
      ),
}));
vi.mock("~/lib/auth_options", () => ({ auth: async () => state.session }));
vi.mock("~/features/assignments/reads", () => ({
  getMyAssignments: async () => state.me,
  getMyPermissionCodes: async () =>
    state.permissions ? new Set(state.permissions) : null,
}));
vi.mock("~/features/notifications/reads", () => ({
  getUnreadNotificationCount: async () => state.unread,
}));
vi.mock("~/features/kosks/actions", () => ({
  getManagedKosks: async () => ({ items: state.kosks }),
  getPendingEnrollments: async (id: string) =>
    Array.from({ length: state.pending[id] ?? 0 }),
}));

const render = async () => {
  const { NizamShell } = await import("~/components/shell/nizam-shell");
  const tree = await NizamShell({
    children: <p>page body</p>,
    footer: <footer>legal</footer>,
  });
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="tr" messages={{}}>
      {tree}
    </NextIntlClientProvider>
  );
};

/** The sidebar's nav: the first `<nav>` is the desktop one; the sheet is a closed portal. */
const sidebarNav = (html: string) =>
  /<aside[\s\S]*?<\/aside>/.exec(html)?.[0] ?? "";
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, "|")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

beforeEach(() => {
  state.session = {
    user: { name: "Abdülhamit Karaosmanoğlu", email: "a@x.t" },
  };
  state.pathname = "/tr";
  state.kosks = [];
  state.pending = {};
  state.unread = 0;
});

describe("without a session", () => {
  it("draws the page alone: no sidebar, no menu button", async () => {
    state.session = null;
    const html = await render();
    expect(html).toContain("page body");
    expect(html).not.toContain("<aside");
    expect(html).not.toContain("mds-appbar");
  });
});

describe("the shell of a köşk nazımı (nizam/52, nizam/31)", () => {
  beforeEach(() => {
    state.me = { systemAdmin: false, assignments: [{ role: "KOSK_NAZIM" }] };
    state.kosks = [
      { id: "k1", name: "Nûruosmaniye Köşkü" },
      { id: "k2", name: "Davutpaşa Köşkü" },
    ];
    state.pending = { k1: 5, k2: 0 };
  });

  it("names the köşk in scope, outside the nav, with the viewer's role", async () => {
    state.pathname = "/tr/kosks/k1/basvurular";
    const aside = sidebarNav(await render());
    expect(aside).toContain("Köşk değiştir:");
    expect(aside).toContain("Nûruosmaniye Köşkü");
    // the scope picker sits above the nav landmark, not in it
    expect(aside.indexOf("Nûruosmaniye Köşkü")).toBeLessThan(
      aside.indexOf("<nav")
    );
    expect(text(aside)).toContain("Köşk nazımı");
  });

  it("lists the groups and items of the canvas, and marks the page", async () => {
    state.pathname = "/tr/kosks/k1/basvurular";
    const nav =
      /<nav[\s\S]*?<\/nav>/.exec(sidebarNav(await render()))?.[0] ?? "";
    expect(text(nav).filter((s) => !/^\d+$/.test(s))).toEqual([
      "Genel",
      "Ana sayfa",
      "Bildirimler",
      "Köşk",
      "Dersler",
      "Başvurular",
      "bekleyen",
      "Ders talepleri",
      "Köşk desteleri",
      "Yasaklamalar",
      "Arşiv",
      "Yönetim",
      "İzinler",
      "Köşk ayarları",
    ]);
    expect(nav).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/tr\/kosks\/k1\/basvurular"/
    );
    expect((nav.match(/aria-current="page"/g) ?? []).length).toBe(1);
  });

  it("shows the count of waiting applications for the köşk in scope, read as 'bekleyen'", async () => {
    state.pathname = "/tr/kosks/k1/basvurular";
    const nav = sidebarNav(await render());
    expect(nav).toMatch(/mds-nav-item__count">5<span[^>]*> bekleyen</);
  });

  it("follows the köşk in the path: another köşk, another count (none for zero)", async () => {
    state.pathname = "/tr/kosks/k2/courses/c1/students";
    const nav = sidebarNav(await render());
    expect(nav).toContain("/tr/kosks/k2/basvurular");
    expect(nav).not.toContain("mds-nav-item__count");
    // a course's roster draws Dersler selected: the köşk-wide Talebeler is not built (MDRS-211)
    expect(nav).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/tr\/kosks\/k2\/dersler"/
    );
    expect(nav).not.toMatch(/\/kosks\/k2\/(celseler|talebeler|ders-kayitlari)/);
  });

  it("carries the same nav in the phone sheet's trigger bar, and 'Çıkış yap' only as the account link's hidden text", async () => {
    const html = await render();
    expect(html).toContain("mds-appbar");
    expect(html).toContain('aria-label="Menü"');
    const nav = /<nav[\s\S]*?<\/nav>/.exec(sidebarNav(html))?.[0] ?? "";
    expect(nav).not.toMatch(/Çıkış/);
  });
});

describe("the unread notifications (MDRS-179, canvas rule 10)", () => {
  beforeEach(() => {
    state.me = { systemAdmin: false, assignments: [{ role: "KOSK_NAZIM" }] };
    state.kosks = [{ id: "k1", name: "Nûruosmaniye Köşkü" }];
  });

  it("badges the menu item and names the bell with the count, drawing no number on the bell", async () => {
    state.unread = 3;
    const html = await render();
    expect(sidebarNav(html)).toMatch(
      /href="\/tr\/bildirimler"[\s\S]*?mds-nav-item__count">3<span[^>]*> okunmamış</
    );
    expect(html).toContain('aria-label="Bildirimler, 3 okunmamış"');
  });

  it("says only 'Bildirimler' for zero, and draws no badge", async () => {
    state.unread = 0;
    const html = await render();
    expect(html).toContain('aria-label="Bildirimler"');
    expect(html).not.toContain("okunmamış");
    expect(sidebarNav(html)).not.toContain("mds-nav-item__count");
  });

  it("points the person row at Hesap, not at the sign-out card", async () => {
    const aside = sidebarNav(await render());
    expect(aside).toMatch(/<a[^>]*mds-nav-user[^>]*href="\/tr\/hesap"/);
  });
});

describe("the other menus", () => {
  it("gives the başnazım the whole platform and no scope picker (nizam/50)", async () => {
    state.me = { systemAdmin: true, assignments: [] };
    const aside = sidebarNav(await render());
    expect(aside).not.toContain("Köşk değiştir");
    for (const label of [
      "Medaris nazımları",
      "İzin grupları",
      "Pasif kapsamlar",
      "İtirazlar",
      "Denetim kaydı",
      "YouTube bağlantısı",
      "Platform ayarları",
    ]) {
      expect(text(aside)).toContain(label);
    }
    expect(text(aside)).toContain("Medaris başnazımı");
  });

  it("gives the Medaris nazımı less (nizam/51)", async () => {
    state.me = { systemAdmin: false, assignments: [{ role: "MEDARIS_NAZIM" }] };
    const aside = sidebarNav(await render());
    expect(text(aside)).toContain("Köşk başvuruları");
    expect(text(aside)).not.toContain("İzin grupları");
    expect(text(aside)).not.toContain("Denetim kaydı");
    expect(text(aside)).not.toContain("Platform ayarları");
    expect(text(aside)).toContain("Medaris nazımı");
  });

  it("shows a Medaris nazımı only the sections their permissions open (nizam/05, criterion 1)", async () => {
    state.me = { systemAdmin: false, assignments: [{ role: "MEDARIS_NAZIM" }] };
    state.permissions = [
      "platform.kosk_create",
      "platform.kosk_application_decide",
      "platform.deck_publish",
      "platform.ban_account",
    ];
    const aside = sidebarNav(await render());
    for (const label of [
      "Ana sayfa",
      "Köşkler",
      "Köşk başvuruları",
      "Deste yayın istekleri",
      "Kalıcı yasak talepleri",
      "Yasaklamalar",
    ]) {
      expect(text(aside)).toContain(label);
    }
    // not given: the madrasah screens (the menu draws them only for their permissions)
    expect(text(aside)).not.toContain("Medreseler");
    state.permissions = null;
  });

  it("gives a köşk nazımı an Ana sayfa inside their köşk's path (nizam/02)", async () => {
    state.me = { systemAdmin: false, assignments: [{ role: "KOSK_NAZIM" }] };
    state.kosks = [{ id: "k1", name: "Nûruosmaniye Köşkü" }];
    state.pathname = "/tr/kosks/k1/ana-sayfa";
    const html = await render();
    expect(html).toContain('href="/tr/kosks/k1/ana-sayfa"');
    // it is the page the viewer is on
    expect(html).toContain('aria-current="page" href="/tr/kosks/k1/ana-sayfa"');
  });

  it("gives an account with no role the brand and the person only (nizam/03)", async () => {
    state.me = { systemAdmin: false, assignments: [] };
    const aside = sidebarNav(await render());
    expect(aside).not.toContain("<nav");
    expect(text(aside)).toContain("Talebe");
    expect(text(aside)).toContain("Abdülhamit Karaosmanoğlu");
  });
});
