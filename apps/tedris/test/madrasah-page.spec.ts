import { resources } from "@medaris/i18n";
import type {
  MadrasahOverviewResponse,
  MadrasahResponse,
} from "@medaris/services/tedrisat";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { enrollmentBadge } from "~/features/courses/madrasah-enrollment";
import { formatNextSession } from "~/features/courses/next-session";

// next-intl's server API without a request: the real catalogue, with `{name}`
// placeholders filled in, and a fixed zone.
const lookup = (key: string, values?: Record<string, unknown>) => {
  const text = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown>)?.[part],
      resources.tr.tedris
    ) as string;
  return Object.entries(values ?? {}).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    text
  );
};
vi.mock("next-intl/server", () => ({
  getTranslations: async () => lookup,
  getLocale: async () => "tr",
  getTimeZone: async () => "Europe/Istanbul",
}));

const render = async (overview: MadrasahOverviewResponse) => {
  const { MadrasahPage } = await import(
    "~/features/courses/components/madrasah-page"
  );
  const madrasah = {
    id: "m1",
    name: "Süleymaniye Medresesi",
    description: "Klasik medrese müfredatını çevrim içi sürdürür.",
  } as MadrasahResponse;
  return renderToStaticMarkup(await MadrasahPage({ madrasah, overview }));
};

const course = (over: Record<string, unknown>) => ({
  id: "c1",
  title: "Bina ve İzhar Şerhi",
  category: "الصرف",
  coverHue: 215,
  koskId: "k1",
  koskName: "Nûruosmaniye Köşkü",
  muderris: [{ name: "Mehmet Emin Işıkoğlu", title: null, isImam: true }],
  enrollmentStatus: null,
  nextSessionAt: null,
  ...over,
});

describe("medrese page enrollment badge", () => {
  it("maps the caller's enrollment to the badge the design shows", () => {
    expect(enrollmentBadge("ENROLLED")).toEqual({
      variant: "brand",
      labelKey: "statusEnrolled",
    });
    expect(enrollmentBadge("PENDING")).toEqual({
      variant: "warning",
      labelKey: "statusPending",
    });
    expect(enrollmentBadge(null)).toBeNull();
    expect(enrollmentBadge(undefined)).toBeNull();
  });
});

describe("next session formatter", () => {
  it("writes the weekday and the clock in the given zone", () => {
    // Sunday 4 October 2026, 21:00 in Istanbul (UTC+3)
    const at = "2026-10-04T18:00:00.000Z";
    expect(formatNextSession(at, "tr", "Europe/Istanbul")).toBe("Paz 21:00");
    expect(formatNextSession(at, "tr", "Europe/London")).toBe("Paz 19:00");
    expect(formatNextSession("Cmt?", "tr", "Europe/Istanbul")).toBe("");
  });
});

describe("medrese page", () => {
  const overview = {
    headMuderris: {
      id: "u1",
      name: "Mehmet Emin Işıkoğlu",
      courseCount: 2,
    },
    kosks: [{ id: "k1", name: "Nûruosmaniye Köşkü" }],
    courses: [
      course({
        enrollmentStatus: "ENROLLED",
        nextSessionAt: "2026-10-04T18:00:00.000Z",
      }),
      course({
        id: "c2",
        title: "İsâgûcî ile mantığa giriş",
        category: "المنطق",
        enrollmentStatus: "PENDING",
      }),
      course({ id: "c3", title: "Rozetsiz ders" }),
    ],
  } as unknown as MadrasahOverviewResponse;

  it("shows the name, the head müderris, the courses and the badges", async () => {
    const html = await render(overview);
    expect(html).toContain("Süleymaniye Medresesi");
    expect(html).toContain("3 ders");
    expect(html).toContain("Başmüderris");
    expect(html).toContain("Bu medresenin 2 dersinde müderris");
    expect(html).toContain(">Devam ediyor<");
    expect(html).toContain("Onay bekliyor");
    expect(html).toContain("Paz 21:00");
    expect(html).toContain("Nûruosmaniye Köşkü");
    expect(html).toContain('href="/courses/c1"');
    expect(html).toContain(", imam");
  });

  it("gives a course with no enrollment no badge", async () => {
    const html = await render({
      ...overview,
      courses: [course({ id: "c3", title: "Rozetsiz ders" })],
    } as MadrasahOverviewResponse);
    expect(html).not.toContain("mds-badge");
    expect(html).toContain("Planlı celse yok");
  });

  it("says so when the medrese has no courses, and lists no köşk", async () => {
    const html = await render({
      headMuderris: null,
      courses: [],
      kosks: [],
    });
    expect(html).toContain("Bu medrese henüz ders açmadı.");
    expect(html).not.toContain("Başmüderris");
  });

  it("has every new key in every locale", () => {
    const keys = Object.keys(resources.tr.tedris.MadrasahPage);
    for (const locale of ["en", "ar"] as const) {
      expect(Object.keys(resources[locale].tedris.MadrasahPage).sort()).toEqual(
        keys.sort()
      );
    }
  });
});
