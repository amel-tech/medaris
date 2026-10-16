import { resources } from "@medaris/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ana sayfa's three sections (MDRS-165, design tedris/01), rendered on the
 * server with their reads replaced: each one is its own read, so one that
 * fails says so and the others still draw.
 */
const reads = vi.hoisted(() => ({
  courses: vi.fn(),
  decks: vi.fn(),
  followed: vi.fn(),
}));
vi.mock("~/features/home/reads", () => ({
  getHomeCourses: reads.courses,
  getHomeDecks: reads.decks,
  getHomeFollowedCourses: reads.followed,
}));

const lookup = (root: string) => {
  const dig = (node: unknown, path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (n, part) => (n as Record<string, unknown>)?.[part],
        node
      );
  // "tedris", "tedrisLearn", and "common.imamStar" for the imam's star
  const read = (key: string) => dig(dig(resources.tr, root), key) as string;
  return (key: string, values: Record<string, unknown> = {}) =>
    Object.entries(values).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      read(key)
    );
};
vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => lookup(ns),
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));
vi.mock("@medaris/ui/mds/progress", () => ({
  Progress: ({ label, value }: { label: string; value: number }) =>
    `<progress>${label} ${value}</progress>`,
}));
vi.mock("@medaris/ui/mds/avatar", () => ({
  Avatar: ({ name }: { name: string }) => `<avatar>${name}</avatar>`,
}));

beforeEach(() => {
  for (const mock of Object.values(reads)) mock.mockReset();
});

const html = async (
  name: "ContinueSection" | "DecksSection" | "FollowedSection"
) => {
  const sections = await import("~/features/home/components/home-sections");
  return renderToStaticMarkup(await sections[name]());
};

const course = (id: string, title: string, over: object = {}) => ({
  id,
  title,
  category: null,
  koskName: "Beyazıt Köşkü",
  madrasahName: null,
  muderris: [{ id: "m1", name: "Abdülhamit", isImam: true }],
  nextSession: { at: "2026-10-04T18:00:00Z", weekNumber: 4 },
  enrollment: { status: "ENROLLED", progress: 40 },
  ...over,
});

describe("Kaldığın yerden devam et", () => {
  it("lists the courses in progress with who teaches them and the next session", async () => {
    reads.courses.mockResolvedValue([course("c1", "Emsile ve Bina")]);
    const out = await html("ContinueSection");
    expect(out).toContain("Kaldığın yerden devam et");
    expect(out).toContain('href="/tr/my-courses"');
    expect(out).toMatch(/href="\/tr\/courses\/c1"[^>]*>Emsile ve Bina</);
    expect(out).toContain("Abdülhamit");
    // a lone müderris is the imam and gets no mark (2026-10-13)
    expect(out).not.toContain("mds-imam-star");
    expect(out).not.toContain("imam");
    expect(out).toContain("İlerlemen 40");
    expect(out).toContain("Beyazıt Köşkü");
    expect(out).toContain("Sonraki celse");
  });

  it("marks the imam with the star after the name among more than one müderris (2026-10-13)", async () => {
    reads.courses.mockResolvedValue([
      course("c1", "Emsile ve Bina", {
        muderris: [
          { id: "m1", name: "Abdülhamit", isImam: true },
          { id: "m2", name: "Ayşe Nur", isImam: false },
        ],
      }),
    ]);
    const out = await html("ContinueSection");
    expect(out).toMatch(
      /Abdülhamit<\/bdi> <button[^>]*aria-label="Dersin imamı"/
    );
    expect(out.match(/aria-label="Dersin imamı"/g)).toHaveLength(1);
  });

  it("says there is no session when none is planned", async () => {
    reads.courses.mockResolvedValue([course("c1", "X", { nextSession: null })]);
    expect(await html("ContinueSection")).toContain("Planlı celse yok");
  });

  it("leaves out a finished course and offers Keşfet when nothing is left", async () => {
    reads.courses.mockResolvedValue([
      course("c1", "Bitti", {
        enrollment: { status: "ENROLLED", progress: 100 },
      }),
    ]);
    const out = await html("ContinueSection");
    expect(out).not.toContain("Bitti");
    expect(out).toContain("Devam eden dersin yok.");
    expect(out).toContain('href="/tr/discover"');
  });

  it("says it could not be read, with a retry, when the read fails", async () => {
    reads.courses.mockResolvedValue(null);
    const out = await html("ContinueSection");
    expect(out).toContain("Bu bölüm şu an okunamadı.");
    expect(out).toContain("Yeniden dene");
    expect(out).not.toContain("Devam eden dersin yok.");
  });
});

const deck = (over: object = {}) => ({
  id: "d1",
  title: "Mehmûz fiiller",
  isMine: true,
  collectionKind: null,
  dueCount: 6,
  addedSinceCollectedCount: 0,
  ...over,
});

describe("Bugün çalışılacak desteler", () => {
  it("says what each deck waits with and links its study page", async () => {
    reads.decks.mockResolvedValue([
      deck(),
      deck({
        id: "d2",
        title: "Sarfın temel kelimeleri",
        isMine: false,
        collectionKind: "KOSK",
        dueCount: 0,
        addedSinceCollectedCount: 5,
      }),
    ]);
    const out = await html("DecksSection");
    expect(out).toContain("Senin desten");
    expect(out).toContain("6 kart tekrar bekliyor");
    expect(out).toContain("Köşk destesi");
    expect(out).toContain("5 yeni kart");
    expect(out).toContain('href="/tr/decks/study/d1"');
    expect(out).toContain('aria-label="Çalış: Mehmûz fiiller"');
    expect(out).toContain('href="/tr/decks"');
  });

  it("is an empty state when nothing waits, and an alert when it could not be read", async () => {
    reads.decks.mockResolvedValue([]);
    expect(await html("DecksSection")).toContain("Bugün çalışacak deste yok.");
    reads.decks.mockResolvedValue(null);
    expect(await html("DecksSection")).toContain("Bu bölüm şu an okunamadı.");
  });
});

describe("Takip ettiğin köşklerden", () => {
  it("lists the courses with their köşk and müderris", async () => {
    reads.followed.mockResolvedValue([
      {
        id: "f1",
        title: "Avâmil ve Tasrîf",
        koskName: "Nûruosmaniye Köşkü",
        muderrisName: "Ayşe Nur Kılıçarslan",
        muderrisIsImam: true,
        muderrisCount: 2,
      },
      { id: "f2", title: "Fıkıh", koskName: "Fatih Köşkü", muderrisName: null },
    ]);
    const out = await html("FollowedSection");
    expect(out).toMatch(/href="\/tr\/courses\/f1"[^>]*>Avâmil ve Tasrîf</);
    expect(out).toContain("Nûruosmaniye Köşkü");
    // the imam among two müderrisler: the star after the name (2026-10-13)
    expect(out).toMatch(
      /Ayşe Nur Kılıçarslan<\/bdi> <button[^>]*aria-label="Dersin imamı"/
    );
    expect(out).toContain('href="/tr/discover"');
    expect(out).not.toContain("Hoca <bdi>null");
  });

  it("marks no imam of a course with one müderris (2026-10-13)", async () => {
    reads.followed.mockResolvedValue([
      {
        id: "f1",
        title: "Avâmil ve Tasrîf",
        koskName: "Nûruosmaniye Köşkü",
        muderrisName: "Ayşe Nur Kılıçarslan",
        muderrisIsImam: true,
        muderrisCount: 1,
      },
    ]);
    const out = await html("FollowedSection");
    expect(out).toContain("Ayşe Nur Kılıçarslan");
    expect(out).not.toContain("mds-imam-star");
    expect(out).not.toContain("imam");
  });

  it("is an empty state, or an alert", async () => {
    reads.followed.mockResolvedValue([]);
    expect(await html("FollowedSection")).toContain(
      "Takip ettiğin köşklerde yeni ders yok."
    );
    reads.followed.mockResolvedValue(null);
    expect(await html("FollowedSection")).toContain(
      "Bu bölüm şu an okunamadı."
    );
  });
});

describe("the sections are independent", () => {
  it("draws two when the third fails", async () => {
    reads.courses.mockResolvedValue(null);
    reads.decks.mockResolvedValue([deck()]);
    reads.followed.mockResolvedValue([]);
    expect(await html("ContinueSection")).toContain("okunamadı");
    expect(await html("DecksSection")).toContain("Mehmûz fiiller");
    expect(await html("FollowedSection")).toContain("yeni ders yok");
  });
});
