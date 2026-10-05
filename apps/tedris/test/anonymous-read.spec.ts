import { resources } from "@medaris/i18n";
import type {
  CourseSummaryResponse,
  KoskResponse,
  MadrasahExploreResponse,
  MadrasahOverviewResponse,
  MadrasahResponse,
} from "@medaris/services/tedrisat";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseDiscoverQuery } from "~/features/discover/discover-query";
import { forVisitor } from "~/features/discover/reads";
import { inviteHrefs } from "~/lib/invite-hrefs";
import { isPublicPath } from "~/lib/public-paths";

/**
 * The signed-out visitor's pages (MDRS-160, designs tedris/09, 10, 11 and 45):
 * Keşfet, the köşk page, the medrese page and the phone menu, rendered with no
 * account. The real catalogue; next-intl's server API without a request.
 */

const text = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;

const fill = (message: string, values: Record<string, unknown> = {}) =>
  Object.entries(values).reduce(
    (acc, [k, v]) =>
      typeof v === "function" ? acc : acc.replaceAll(`{${k}}`, String(v)),
    message
  );

/** next-intl's `t.rich`: `<tag>chunk</tag>` becomes `values.tag(chunk)`. */
const rich = (key: string, values: Record<string, unknown> = {}): ReactNode => {
  const parts: ReactNode[] = [];
  let rest = text(key);
  for (;;) {
    const found = /<(\w+)>(.*?)<\/\1>/.exec(rest);
    if (!found) break;
    parts.push(rest.slice(0, found.index));
    parts.push(
      (values[found[1]] as (chunk: string) => ReactNode)(found[2] as string)
    );
    rest = rest.slice(found.index + found[0].length);
  }
  parts.push(rest);
  return createElement(Fragment, null, ...parts);
};

const lookup = Object.assign(
  (key: string, values?: Record<string, unknown>) => fill(text(key), values),
  { rich }
);

vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
// The phone menu's own hooks, and the kit's bar drawn open: its sheet is a
// Base UI Dialog portal, which a static render leaves closed. The sheet's
// behaviour (focus, closing, 768 px) is the kit's and has its own specs.
const pathname = vi.hoisted(() => ({ current: "/discover" }));
vi.mock("next-intl", () => ({
  useLocale: () => "tr",
  useTranslations: () => (key: string) =>
    key
      .split(".")
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources.tr.tedris
      ),
}));
vi.mock("~/lib/i18n/navigation", () => ({
  usePathname: () => pathname.current,
}));
vi.mock("@medaris/ui/mds/app-bar", () => ({
  AppBar: (props: {
    title: ReactNode;
    actions: ReactNode;
    footer: ReactNode;
    children: ReactNode;
  }) =>
    createElement(
      "div",
      null,
      createElement("p", { "data-title": true }, props.title),
      createElement("div", { "data-actions": true }, props.actions),
      createElement("nav", null, props.children),
      createElement("div", { "data-foot": true }, props.footer)
    ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tr/discover",
}));
vi.mock("~/features/courses/actions", () => ({
  followKosk: vi.fn(),
  unfollowKosk: vi.fn(),
  leaveCourse: vi.fn(),
}));

const kosk = (over: Partial<KoskResponse> = {}): KoskResponse =>
  ({
    id: "k1",
    ownerId: null,
    managerIds: [],
    managerName: "Abdülhamit Karaosmanoğlu",
    name: "Nûruosmaniye Köşkü",
    description: "Arapça dil ilimlerinin köşkü.",
    coverHue: 215,
    isPrivate: false,
    field: "Arapça dil ilimleri",
    level: "BEGINNER",
    tags: [],
    courseCount: 3,
    isFollowing: false,
    ...over,
  }) as KoskResponse;

const madrasah = (
  over: Partial<MadrasahExploreResponse> = {}
): MadrasahExploreResponse => ({
  id: "m1",
  handle: "suleymaniye",
  name: "Süleymaniye Medresesi",
  headMuderrisName: "Mehmet Emin Işıkoğlu",
  courseCount: 2,
  courses: [{ id: "c1", title: "Bina ve İzhar Şerhi", coverHue: 215 }],
  ...over,
});

const discoverData = (over: Record<string, unknown> = {}) => ({
  kosks: [kosk()],
  koskTotal: 1,
  madrasahs: [madrasah()],
  allMadrasahs: [madrasah()],
  ...over,
});

const tr = resources.tr.tedris;

describe("which pages a visitor with no account may open", () => {
  it("opens Keşfet in every locale, and no page below it", () => {
    for (const path of ["/discover", "/tr/discover", "/en/discover/"]) {
      expect(isPublicPath(path)).toBe(true);
    }
    for (const path of [
      "/tr/discover/anything",
      "/tr/my-courses",
      "/tr/learning",
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });
});

describe("Keşfet for a visitor (design tedris/09)", () => {
  const render = async (d: ReturnType<typeof discoverData>) => {
    const { DiscoverPage } = await import(
      "~/features/discover/components/discover-page"
    );
    return renderToStaticMarkup(
      await DiscoverPage({
        query: parseDiscoverQuery({}),
        data: d as never,
        signedIn: false,
      })
    );
  };

  it("has no follow button on any card", async () => {
    const html = await render(
      discoverData({
        kosks: [kosk(), kosk({ id: "k2", name: "Fatih Köşkü" })],
        koskTotal: 2,
      })
    );
    expect(html).toContain("Fatih Köşkü");
    expect(html).not.toContain(tr.DiscoverPage.follow);
    expect(html).not.toContain(tr.DiscoverPage.following);
  });

  it("closes with the invitation, linking to sign-in (back to Keşfet) and to registration", async () => {
    const html = await render(discoverData());
    const hrefs = inviteHrefs("tr", "/discover");
    expect(html).toContain(`href="${hrefs.signIn}">giriş yap</a>`);
    expect(html).toContain(`href="${hrefs.register}">kayıt ol</a>`);
    expect(hrefs.signIn).toBe("/tr/auth/signin?callbackUrl=%2Fdiscover");
    expect(html).toContain("hesap açmadan da göz atabilirsin");
    expect(html).not.toContain(tr.DiscoverPage.applyLink);
  });

  it("returns to the same filtered list after signing in", async () => {
    const { DiscoverPage } = await import(
      "~/features/discover/components/discover-page"
    );
    const html = renderToStaticMarkup(
      await DiscoverPage({
        query: parseDiscoverQuery({ q: "sarf" }),
        data: discoverData() as never,
        signedIn: false,
      })
    );
    expect(html).toContain(
      `callbackUrl=${encodeURIComponent("/discover?q=sarf")}`
    );
  });

  it("still offers a signed-in talebe the follow button and the köşk application", async () => {
    const { DiscoverPage } = await import(
      "~/features/discover/components/discover-page"
    );
    const html = renderToStaticMarkup(
      await DiscoverPage({
        query: parseDiscoverQuery({}),
        data: discoverData() as never,
      })
    );
    expect(html).toContain(tr.DiscoverPage.follow);
    expect(html).toContain(tr.DiscoverPage.applyLink);
    expect(html).not.toContain("giriş yap");
  });
});

describe("the list a visitor is given", () => {
  it("leaves out the medreses that have opened no course", () => {
    const empty = madrasah({ id: "m2", name: "Zeyrek", courseCount: 0 });
    const data = forVisitor(
      discoverData({
        madrasahs: [madrasah(), empty],
        allMadrasahs: [madrasah(), empty],
      })
    );
    expect(data.madrasahs.map((m) => m.id)).toEqual(["m1"]);
    expect(data.allMadrasahs.map((m) => m.id)).toEqual(["m1"]);
    expect(data.kosks).toHaveLength(1);
  });
});

describe("the köşk page for a visitor (design tedris/10)", () => {
  const course = (over: Partial<CourseSummaryResponse> = {}) =>
    ({
      id: "c1",
      title: "Emsile ve Bina",
      category: "الصرف",
      coverHue: 10,
      muderris: [{ id: "u1", name: "Abdülhamit Karaosmanoğlu", isImam: true }],
      madrasah: null,
      enrollment: null,
      nextSessionAt: null,
      ...over,
    }) as CourseSummaryResponse;

  const render = async (signedIn: boolean) => {
    const { KoskPage } = await import(
      "~/features/courses/components/kosk-page"
    );
    return renderToStaticMarkup(
      await KoskPage({
        kosk: kosk(),
        courses: [course()],
        decks: null,
        signedIn,
      })
    );
  };

  it("names the köşk's manager and has no follow button, no decks and no badge", async () => {
    const html = await render(false);
    expect(html).toContain("Köşk nazımı Abdülhamit Karaosmanoğlu");
    expect(html).not.toContain(tr.KoskPage.follow);
    expect(html).not.toContain(tr.KoskPage.decksTitle);
    expect(html).not.toContain(tr.KoskPage.statusPending);
    expect(html).not.toContain(tr.KoskPage.statusEnrolled);
  });

  it("invites the visitor to sign in or register, and to come back to this köşk", async () => {
    const html = await render(false);
    expect(html).toContain("Bir derse başvurmak için");
    expect(html).toContain(
      `href="${inviteHrefs("tr", "/kosks/k1").signIn}">giriş yap</a>`
    );
  });

  it("leaves the invitation out for a signed-in caller", async () => {
    expect(await render(true)).not.toContain("giriş yap");
  });

  it("says nothing of a manager the köşk has no name for", async () => {
    const { KoskPage } = await import(
      "~/features/courses/components/kosk-page"
    );
    const html = renderToStaticMarkup(
      await KoskPage({
        kosk: kosk({ managerName: null }),
        courses: [],
        decks: null,
        signedIn: false,
      })
    );
    expect(html).not.toContain("Köşk nazımı");
  });
});

describe("the medrese page for a visitor (design tedris/11)", () => {
  const overview = {
    headMuderris: { id: "u1", name: "Mehmet Emin Işıkoğlu", courseCount: 2 },
    courses: [
      {
        id: "c1",
        title: "Bina ve İzhar Şerhi",
        category: "الصرف",
        coverHue: 215,
        koskId: "k1",
        koskName: "Nûruosmaniye Köşkü",
        muderris: [{ name: "Mehmet Emin Işıkoğlu", title: null, isImam: true }],
        enrollmentStatus: null,
        nextSessionAt: null,
      },
    ],
    kosks: [{ id: "k1", name: "Nûruosmaniye Köşkü" }],
  } as unknown as MadrasahOverviewResponse;

  const render = async (signedIn: boolean) => {
    const { MadrasahPage } = await import(
      "~/features/courses/components/madrasah-page"
    );
    return renderToStaticMarkup(
      await MadrasahPage({
        madrasah: {
          id: "m1",
          name: "Süleymaniye Medresesi",
          description: "Klasik medrese müfredatı.",
        } as MadrasahResponse,
        overview,
        signedIn,
      })
    );
  };

  it("shows no enrollment badge and invites the visitor", async () => {
    const html = await render(false);
    expect(html).not.toContain(tr.MadrasahPage.statusPending);
    expect(html).not.toContain(tr.MadrasahPage.statusEnrolled);
    expect(html).toContain(tr.MadrasahPage.coursesHintAnonymous);
    expect(html).toContain(
      `href="${inviteHrefs("tr", "/madrasahs/m1").signIn}">giriş yap</a>`
    );
  });

  it("words the courses hint differently for a signed-in caller", async () => {
    const html = await render(true);
    expect(html).toContain(tr.MadrasahPage.coursesHint);
    expect(html).not.toContain(tr.MadrasahPage.coursesHintAnonymous);
  });

  it("draws the köşk card with a badge, a link and the course opened there", async () => {
    const html = await render(false);
    expect(html).toContain(">NK</span>");
    expect(html).toContain(
      'href="/kosks/k1"><bdi>Nûruosmaniye Köşkü</bdi></a>'
    );
    expect(html).toContain(">Bina ve İzhar Şerhi</span>");
  });

  it("leads back to Keşfet, which a visitor may now open", async () => {
    expect(await render(false)).toContain('href="/discover"');
  });

  it("leaves the invitation out for a signed-in caller", async () => {
    expect(await render(true)).not.toContain("giriş yap");
  });
});

describe("the links of the invitation", () => {
  it("send sign-in back to the page, and registration to its own page", () => {
    expect(inviteHrefs("tr", "/kosks/k1?x=1")).toEqual({
      signIn: "/tr/auth/signin?callbackUrl=%2Fkosks%2Fk1%3Fx%3D1",
      register: "/tr/auth/register",
    });
  });
});

describe("the phone menu of a visitor (design tedris/45)", () => {
  const render = async (path: string) => {
    pathname.current = path;
    const { PhoneMenu } = await import("~/components/phone-menu/phone-menu");
    return renderToStaticMarkup(createElement(PhoneMenu));
  };
  const nav = (html: string) => /<nav>(.*?)<\/nav>/.exec(html)?.[1] as string;

  it("holds Keşfet alone: no Ana sayfa, and none of a signed-in talebe's pages", async () => {
    const menu = nav(await render("/discover"));
    expect(menu).toContain(">Keşfet<");
    for (const absent of [
      "Ana sayfa",
      "Derslerim",
      "Programım",
      "Desteler",
      "Çıkış yap",
    ]) {
      expect(menu).not.toContain(absent);
    }
  });

  it("marks the page the visitor is on", async () => {
    const discover = nav(await render("/kosks/k1"));
    expect(discover).toMatch(/href="\/tr\/discover" aria-current="page"/);
    expect(discover).not.toContain("/tr/home");
  });

  it("ends in Giriş yap, back to this page, and Kayıt ol", async () => {
    const html = await render("/kosks/k1");
    const foot = /data-foot="true">(.*)$/.exec(html)?.[1] as string;
    expect(foot).toContain(`href="${inviteHrefs("tr", "/kosks/k1").signIn}"`);
    expect(foot).toContain(">Giriş yap<");
    expect(foot).toContain('href="/tr/auth/register"');
    expect(foot).toContain(">Kayıt ol<");
  });

  it("puts the way in on the bar and names the page", async () => {
    const html = await render("/discover");
    // the theme toggle comes first, then the way in
    expect(html).toMatch(
      /data-actions="true"><button[^>]*aria-label="Koyu temaya geç"[\s\S]*?<\/button><a[^>]*aria-label="Giriş yap"/
    );
    expect(html).toMatch(/data-title="true">Keşfet</);
  });
});
