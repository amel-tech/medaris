import { resources } from "@medaris/i18n";
import type {
  CourseSummaryResponse,
  EnrolledCourseResponse,
  KoskDecksResponse,
  KoskResponse,
  MadrasahExploreResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseDiscoverQuery } from "~/features/discover/discover-query";

// `rich` is only read by the signed-out invitation: the tags are dropped here,
// the links they make are pinned in anonymous-read.spec.ts.
const lookup = Object.assign(
  (key: string, values?: Record<string, unknown>) => plain(key, values),
  { rich: (key: string) => plain(key).replace(/<\/?\w+>/g, "") }
);
function plain(key: string, values?: Record<string, unknown>) {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
  return Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    text
  );
}
vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
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
    name: "Nûruosmaniye Köşkü",
    handle: "@nuruosmaniye",
    description: "Arapça dil ilimlerinin köşkü.",
    coverHue: 215,
    isPrivate: false,
    field: "Arapça dil ilimleri",
    level: "BEGINNER",
    tags: [],
    courseCount: 3,
    isFollowing: true,
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
  courses: [
    { id: "c1", title: "Bina ve İzhar Şerhi", coverHue: 215 },
    { id: "c2", title: "İsâgûcî ile mantığa giriş", coverHue: 215 },
  ],
  ...over,
});

const data = (over: Record<string, unknown> = {}) => ({
  kosks: [kosk()],
  koskTotal: 1,
  madrasahs: [madrasah()],
  allMadrasahs: [madrasah()],
  fields: ["Arapça dil ilimleri", "Fıkıh"],
  ...over,
});

const renderDiscover = async (
  d: ReturnType<typeof data> | null,
  query = parseDiscoverQuery({}),
  failed = false
) => {
  const { DiscoverPage } = await import(
    "~/features/discover/components/discover-page"
  );
  return renderToStaticMarkup(
    await DiscoverPage({
      query,
      data: d as never,
      failed,
    })
  );
};

describe("Keşfet (design tedris/02)", () => {
  it("lists köşks and medreses under their own headings, with the count line", async () => {
    const html = await renderDiscover(
      data({
        kosks: [
          kosk(),
          kosk({
            id: "k2",
            name: "Fatih Köşkü",
            level: "INTERMEDIATE",
            isFollowing: false,
          }),
        ],
        koskTotal: 3,
        madrasahs: [
          madrasah(),
          madrasah({
            id: "m2",
            name: "Zeyrek Medresesi",
            headMuderrisName: null,
            courseCount: 0,
            courses: [],
          }),
        ],
      })
    );
    expect(html).toContain("3 köşk ve 2 medrese");
    expect(html).toContain(">Köşkler<");
    expect(html).toContain(">Medreseler<");
    expect(html).toContain("Nûruosmaniye Köşkü");
    expect(html).toContain("Başlangıç seviyesi");
    expect(html).toContain("Orta seviye");
    expect(html).toContain("3 ders");
  });

  it("marks followed köşks 'Takip ediliyor' and the rest 'Takip et'", async () => {
    const html = await renderDiscover(
      data({
        kosks: [
          kosk(),
          kosk({ id: "k2", name: "Beyazıt Köşkü", isFollowing: false }),
        ],
        koskTotal: 2,
      })
    );
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<[^>]*>)*Takip ediliyor/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Takip et/);
  });

  it("shows a medrese's başmüderris and course links, and says so when it has no course", async () => {
    const html = await renderDiscover(
      data({
        madrasahs: [
          madrasah(),
          madrasah({
            id: "m2",
            name: "Zeyrek Medresesi",
            headMuderrisName: null,
            courseCount: 0,
            courses: [],
          }),
        ],
      })
    );
    expect(html).toContain("Başmüderris Mehmet Emin Işıkoğlu");
    expect(html).toContain('href="/courses/c1"');
    expect(html).toContain("Bu medrese henüz ders açmadı.");
  });

  it("leads the köşk card to the köşk and the medrese card to the medrese", async () => {
    const html = await renderDiscover(data());
    expect(html).toContain('href="/kosks/k1"');
    expect(html).toContain('href="/madrasahs/m1"');
  });

  it("ends with the way to ask for a köşk", async () => {
    const html = await renderDiscover(data());
    expect(html).toContain(
      "Bir ilim için köşk açılmasını istiyorsan başvurabilirsin; başvurunu Medaris yönetimi değerlendirir."
    );
    expect(html).toContain("Köşk açma başvurusu");
  });

  it("says '0 köşk ve 0 medrese' with a way to clear the filter when nothing matches", async () => {
    const html = await renderDiscover(
      data({ kosks: [], koskTotal: 0, madrasahs: [] }),
      parseDiscoverQuery({ q: "yok" })
    );
    expect(html).toContain("0 köşk ve 0 medrese");
    expect(html).toContain("Bu aramaya uyan köşk ya da medrese yok.");
    expect(html).toContain("Filtreleri temizle");
  });

  it("offers no clearing when nothing is filtered and the platform is empty", async () => {
    const html = await renderDiscover(
      data({ kosks: [], koskTotal: 0, madrasahs: [] })
    );
    expect(html).not.toContain("Filtreleri temizle");
  });

  it("is an Alert with a retry, never an empty list, when the read failed", async () => {
    const html = await renderDiscover(
      null,
      parseDiscoverQuery({ level: "BEGINNER" }),
      true
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Keşfet yüklenemedi");
    expect(html).toContain("Yeniden dene");
    expect(html).toContain('href="/discover?level=BEGINNER"');
    expect(html).not.toContain("0 köşk ve 0 medrese");
    expect(html).not.toContain("Köşk açma başvurusu");
  });

  it("pages the köşks 12 at a time, keeping the filters in the links", async () => {
    const html = await renderDiscover(
      data({ koskTotal: 30 }),
      parseDiscoverQuery({ page: "2", level: "BEGINNER" })
    );
    expect(html).toContain("2 / 3");
    expect(html).toContain('href="/discover?level=BEGINNER"');
    expect(html).toContain('href="/discover?level=BEGINNER&amp;page=3"');
  });

  it("shows no pager for one page", async () => {
    const html = await renderDiscover(data());
    expect(html).not.toContain("Sonraki");
  });

  it("gives the filters: a search, the two selects and the alan chips with 'Tümü'", async () => {
    const html = await renderDiscover(data());
    expect(html).toContain('type="search"');
    expect(html).toContain("Bütün seviyeler");
    expect(html).toContain("Bütün medreseler");
    expect(html).toContain(">Tümü<");
    expect(html).toContain(">Fıkıh<");
  });
});

const summary = (over: Record<string, unknown> = {}): CourseSummaryResponse =>
  ({
    id: "c1",
    title: "Emsile ve Bina",
    category: "الصرف",
    level: "BEGINNER",
    muderris: [{ id: "u1", name: "Abdülhamit Karaosmanoğlu", isImam: true }],
    enrollment: null,
    madrasah: null,
    nextSessionAt: null,
    ...over,
  }) as CourseSummaryResponse;

const renderKosk = async (
  courses: CourseSummaryResponse[],
  decks: KoskDecksResponse | null,
  signedIn = true,
  k = kosk()
) => {
  const { KoskPage } = await import("~/features/courses/components/kosk-page");
  return renderToStaticMarkup(
    await KoskPage({ kosk: k, courses, decks, signedIn })
  );
};

describe("köşk page (design tedris/04)", () => {
  it("names the köşk, its alan, level and course count, and links back to Keşfet", async () => {
    const html = await renderKosk([summary()], null);
    expect(html).toContain("Nûruosmaniye Köşkü");
    expect(html).toContain("Arapça dil ilimleri");
    expect(html).toContain("Başlangıç seviyesi");
    expect(html).toContain("3 ders");
    expect(html).toContain('href="/discover"');
    expect(html).toContain("Takip ediliyor");
  });

  it("badges a course by the caller's enrollment: Devam ediyor, Onay bekliyor, Tamamlandı", async () => {
    const html = await renderKosk(
      [
        summary({ id: "a", title: "A", enrollment: { status: "ENROLLED" } }),
        summary({ id: "b", title: "B", enrollment: { status: "PENDING" } }),
        summary({ id: "c", title: "C", enrollment: { status: "COMPLETED" } }),
        summary({ id: "d", title: "D" }),
      ],
      null
    );
    expect(html.match(/Devam ediyor/g)).toHaveLength(1);
    expect(html.match(/Onay bekliyor/g)).toHaveLength(1);
    expect(html.match(/>Tamamlandı</g)).toHaveLength(1);
  });

  it("names the medrese that opened a course, and marks the imam among the müderrisler", async () => {
    const html = await renderKosk(
      [
        summary({
          madrasah: { id: "m1", name: "Süleymaniye Medresesi" },
          muderris: [
            { id: "u1", name: "Mehmet Emin Işıkoğlu", isImam: true },
            { id: "u2", name: "Abdülhamit Karaosmanoğlu", isImam: false },
          ],
        }),
      ],
      null
    );
    expect(html).toContain('href="/madrasahs/m1"');
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toMatch(/Mehmet Emin Işıkoğlu<\/bdi>, imam/);
    expect(html).not.toMatch(/Abdülhamit Karaosmanoğlu<\/bdi>, imam/);
  });

  it("writes the next session as weekday and clock, or says none is planned", async () => {
    const html = await renderKosk(
      [
        summary({ nextSessionAt: "2026-10-03T18:00:00.000Z" }),
        summary({ id: "c2", title: "İki" }),
      ],
      null
    );
    expect(html).toContain("Sonraki celse");
    expect(html).toContain("Cmt 21:00");
    expect(html).toContain("Planlı celse yok");
  });

  it("shows the decks to a köşk's own talebe, with the card count and the collection mark", async () => {
    const html = await renderKosk([summary()], {
      accessible: true,
      decks: [
        {
          id: "d1",
          title: "Sarfın temel kelimeleri",
          cardCount: 60,
          inCollection: true,
        },
        { id: "d2", title: "Nahiv", cardCount: 12, inCollection: false },
      ],
    });
    expect(html).toContain("Köşk desteleri");
    expect(html).toContain("Köşkün derslerine kayıtlı talebelere açık");
    expect(html).toContain("Köşk destesi");
    expect(html).toContain("60 ezber kartı");
    expect(html.match(/Koleksiyonunda/g)).toHaveLength(1);
    expect(html).toContain('href="/decks/d1"');
  });

  it("leaves the deck block out for a caller the köşk does not know, and for a visitor", async () => {
    for (const decks of [{ accessible: false, decks: [] }, null]) {
      const html = await renderKosk([summary()], decks);
      expect(html).not.toContain("Köşk desteleri");
    }
  });

  it("gives a visitor no follow button", async () => {
    const html = await renderKosk([summary()], null, false);
    expect(html).not.toContain("Takip ediliyor");
    expect(html).not.toContain("Takip et");
  });

  it("says so when the köşk has no course", async () => {
    const html = await renderKosk([], null);
    expect(html).toContain("Bu köşk henüz ders açmadı.");
  });
});

const enrolled = (
  id: string,
  status: string,
  over: Record<string, unknown> = {}
): EnrolledCourseResponse =>
  ({
    id,
    title: `Ders ${id}`,
    category: "الصرف",
    koskName: "Nûruosmaniye Köşkü",
    madrasahName: null,
    muderris: [{ id: `m${id}`, name: "Ayşe Nur Kılıçarslan", isImam: true }],
    nextSession: null,
    enrollment: {
      status,
      progress: 40,
      completedAt: null,
      createdAt: "2026-09-28T09:00:00.000Z",
      updatedAt: "2026-09-28T09:00:00.000Z",
    },
    ...over,
  }) as unknown as EnrolledCourseResponse;

const renderMine = async (
  courses: EnrolledCourseResponse[] | null,
  failed = false
) => {
  const { MyCoursesPage } = await import(
    "~/features/courses/components/my-courses-page"
  );
  return renderToStaticMarkup(await MyCoursesPage({ courses, failed }));
};

describe("Derslerim (design tedris/20)", () => {
  it("puts each course in the section its status names, with counts that agree", async () => {
    const html = await renderMine([
      enrolled("1", "ENROLLED"),
      enrolled("2", "ENROLLED"),
      enrolled("3", "ENROLLED"),
      enrolled("4", "PENDING"),
      enrolled("5", "COMPLETED", {
        enrollment: {
          status: "COMPLETED",
          progress: 100,
          completedAt: "2026-09-26T10:00:00.000Z",
          createdAt: "2026-08-01T09:00:00.000Z",
          updatedAt: "2026-09-26T10:00:00.000Z",
        },
      }),
    ]);
    expect(html).toContain("Devam eden dersler");
    expect(html).toContain("3 ders");
    expect(html).toContain("1 başvuru onay bekliyor");
    expect(html).toContain("Tamamladığın dersler");
    expect(html).toContain(
      "Ders kadrosu 26 Eylül 2026 tarihinde tamamladığını onayladı."
    );
    expect(html).toContain(
      "Başvurdun: 28 Eylül 2026. Onaylanınca ders, devam eden derslerine geçer."
    );
  });

  it("draws the progress bar with its name and percent", async () => {
    const html = await renderMine([enrolled("1", "ENROLLED")]);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("İlerlemen");
    expect(html).toContain("%40");
  });

  it("writes the next session with its day and week, or says none is planned", async () => {
    const html = await renderMine([
      enrolled("1", "ENROLLED", {
        nextSession: { at: "2026-10-03T18:00:00.000Z", weekNumber: 5 },
      }),
      enrolled("2", "ENROLLED"),
    ]);
    expect(html).toContain("Sıradaki celse");
    expect(html).toContain("3 Eki Cmt 21:00");
    expect(html).toContain("Hafta 5");
    expect(html).toContain("Planlı celse yok");
  });

  it("offers the withdrawal on a request, the calendar link on the page, and the course link on a finished one", async () => {
    const html = await renderMine([
      enrolled("4", "PENDING"),
      enrolled("5", "COMPLETED"),
    ]);
    expect(html).toContain("Başvuruyu geri çek");
    expect(html).toContain("Onay bekliyor");
    expect(html).toContain("Takvim aboneliği");
    expect(html).toContain('href="/learning/calendar"');
    expect(html).toContain("Ders kayıtlarına git");
  });

  it("names the medrese before the köşk when the course was opened by one", async () => {
    const html = await renderMine([
      enrolled("1", "ENROLLED", { madrasahName: "Süleymaniye Medresesi" }),
    ]);
    expect(html.indexOf("Süleymaniye Medresesi")).toBeLessThan(
      html.indexOf("Nûruosmaniye Köşkü")
    );
  });

  it("sends a talebe with nothing at all to Keşfet", async () => {
    const html = await renderMine([]);
    expect(html).toContain("Henüz bir derse kayıtlı ya da başvurulu değilsin.");
    expect(html).toContain('href="/discover"');
  });

  it("is an Alert, never 'no courses', when the read failed", async () => {
    const html = await renderMine(null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Derslerin yüklenemedi");
    expect(html).not.toContain("Henüz bir derse");
  });
});
