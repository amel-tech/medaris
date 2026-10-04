import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { sectionSegments } from "~/features/shell/nav";
import { buildScopes } from "~/features/shell/scope";
import { scopeOption } from "~/features/shell/scope-option";
import { assignment, course, medrese } from "./fixtures";
import { html, textOf, translatorFor } from "./server-render";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => translatorFor(namespace),
}));

const props = (bolum: string) => ({ params: Promise.resolve({ bolum }) });

/**
 * The medrese's sections that have a page of their own (MDRS-184, MDRS-185,
 * MDRS-187): a static route folder wins over the placeholder's `[bolum]`, so
 * these never reach it.
 */
const BUILT = ["nazirlar", "ayarlar", "arsiv", "talebeler", "yasaklamalar"];

/** The pages no package has built yet: one placeholder per kind of scope. */
describe("the shared placeholder under a medrese", () => {
  const page = async (bolum: string) =>
    (await import("../app/medrese/[medreseId]/[bolum]/page")).default(
      props(bolum)
    );

  it("answers every segment of the menu that has no page yet with the entry's name and a sentence", async () => {
    for (const segment of sectionSegments("medrese")) {
      if (BUILT.includes(segment)) continue;
      const text = textOf(await html(await page(segment)));
      expect(text, segment).toContain("Bu sayfa henüz hazır değil.");
    }
    expect(textOf(await html(await page("dersler")))).toMatch(/^Dersler /);
    expect(textOf(await html(await page("kabul-kurallari")))).toMatch(
      /^Kabul kuralları /
    );
  });

  it("leaves the sections that have a page to their own route folder", () => {
    for (const segment of BUILT) {
      expect(sectionSegments("medrese"), segment).toContain(segment);
      expect(
        existsSync(
          join(
            import.meta.dirname,
            "..",
            "app",
            "medrese",
            "[medreseId]",
            segment,
            "page.tsx"
          )
        ),
        segment
      ).toBe(true);
    }
  });

  it("answers 404 for a segment the menu does not have", async () => {
    for (const segment of ["mufredat", "kayitlar", "yok", "Dersler", ""]) {
      await expect(page(segment), segment).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});

/** The course's sections that have a page of their own: Celseler, Talebeler, Müfredat and Ders kayıtları (MDRS-247). */
const DERS_BUILT = ["celseler", "talebeler", "mufredat", "kayitlar"];

describe("the shared placeholder under a course", () => {
  const page = async (bolum: string) =>
    (await import("../app/ders/[dersId]/[bolum]/page")).default(props(bolum));

  it("answers every segment of the menu that has no page yet", async () => {
    for (const segment of sectionSegments("ders")) {
      if (DERS_BUILT.includes(segment)) continue;
      const text = textOf(await html(await page(segment)));
      expect(text, segment).toContain("Bu sayfa henüz hazır değil.");
    }
    expect(textOf(await html(await page("deste")))).toMatch(/^Ders destesi /);
    expect(textOf(await html(await page("ayarlar")))).toMatch(
      /^Ders ayarları /
    );
  });

  it("leaves the sections that have a page to their own route folder", () => {
    for (const segment of DERS_BUILT) {
      expect(sectionSegments("ders"), segment).toContain(segment);
      expect(
        existsSync(
          join(
            import.meta.dirname,
            "..",
            "app",
            "ders",
            "[dersId]",
            segment,
            "page.tsx"
          )
        ),
        segment
      ).toBe(true);
    }
  });

  it("answers 404 for a segment of the medrese's menu", async () => {
    for (const segment of ["dersler", "itirazlar", "kabul-kurallari"]) {
      await expect(page(segment), segment).rejects.toThrow("NEXT_NOT_FOUND");
    }
  });
});

describe("the scope's own pages", () => {
  it("are placeholders named Genel bakış and Bildirimler until their packages arrive", async () => {
    const overview = (await import("../app/ders/[dersId]/page")).default();
    expect(textOf(await html(overview))).toMatch(/^Genel bakış /);
    const bell = (await import("../app/(global)/bildirimler/page")).default();
    expect(textOf(await html(bell))).toMatch(/^Bildirimler /);
  });
});

describe("a scope as the picker draws it", () => {
  const words = {
    role: (role: string) => `rol:${role}`,
    imam: "dersin imamı",
  };
  const [m, c] = buildScopes([
    medrese(),
    assignment({
      scopeId: "c-1",
      scopeName: "Bina ve İzhar Şerhi",
      isImam: true,
      course: course(),
    }),
  ]);

  it("has the role on its second line, and the imam after it for a course", () => {
    expect(scopeOption(m as never, words)).toMatchObject({
      key: "medrese:m-1",
      href: "/medrese/m-1",
      summary: ["rol:MEDRESE_BASMUDERRIS"],
      detail: ["rol:MEDRESE_BASMUDERRIS"],
    });
    expect(scopeOption(c as never, words)).toMatchObject({
      key: "ders:c-1",
      href: "/ders/c-1",
      summary: ["rol:MUDERRIS", "dersin imamı"],
      // the open list adds the köşk
      detail: ["rol:MUDERRIS", "dersin imamı", "Nûruosmaniye Köşkü"],
    });
  });
});
