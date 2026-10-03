import { resources } from "@medaris/i18n";
import type { InactiveScopeResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InactiveView } from "~/features/inactive-scopes/components/inactive-view";
import {
  assignKey,
  contentPath,
  daysPassive,
  filterByType,
  inactiveErrorKey,
  reasonKey,
} from "~/features/inactive-scopes/present";

// The server actions reach for the session and the API, and the router needs
// a mounted app; none of them runs in a render.
vi.mock("~/features/inactive-scopes/actions", () => ({
  assignScope: vi.fn(),
  recordScopeView: vi.fn(),
}));
vi.mock("~/features/madrasahs/actions", () => ({
  lookupUserByEmail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const IST = "Europe/Istanbul";

const person = (id: string, name: string) => ({ id, name, email: null });

const rows: InactiveScopeResponse[] = [
  {
    type: "MADRASAH",
    id: "m1",
    name: "Zeyrek Medresesi",
    kosk: null,
    reason: "EXPIRED",
    since: new Date("2026-09-27T09:00:00Z"),
    lastManager: person("h", "Abdurrahman Şeref Tunalıoğlu"),
    lastRole: "MEDRESE_BASMUDERRIS",
    wasImam: false,
    removedBy: null,
    removedByRole: null,
  },
  {
    type: "COURSE",
    id: "c1",
    name: "Kasîde-i Bürde şerhi",
    kosk: { id: "k1", name: "Beyazıt Köşkü" },
    reason: "REMOVED",
    since: new Date("2026-09-30T09:00:00Z"),
    lastManager: person("m", "Halil İbrahim Sarıkaya"),
    lastRole: "MUDERRIS",
    wasImam: true,
    removedBy: person("a", "Ayşe Nur Kılıçarslan"),
    removedByRole: "KOSK_NAZIM",
  },
];

const [medrese, course] = rows as [
  InactiveScopeResponse,
  InactiveScopeResponse,
];

describe("how long a scope has been passive (nizam/14)", () => {
  it("counts calendar days in the viewer's zone", () => {
    const now = new Date("2026-10-01T09:00:00Z");
    expect(daysPassive("2026-09-27T09:00:00Z", now, IST)).toBe(4);
    expect(daysPassive("2026-09-30T09:00:00Z", now, IST)).toBe(1);
    // 22:30 UTC on the 30th is already the 1st in Istanbul
    expect(daysPassive("2026-09-30T22:30:00Z", now, IST)).toBe(0);
  });

  it("is never negative", () => {
    expect(
      daysPassive("2026-10-05T09:00:00Z", new Date("2026-10-01T09:00:00Z"), IST)
    ).toBe(0);
  });
});

describe("the type filter", () => {
  it("keeps one kind, or all of them", () => {
    expect(filterByType(rows, "ALL")).toHaveLength(2);
    expect(filterByType(rows, "COURSE").map((r) => r.id)).toEqual(["c1"]);
    expect(filterByType(rows, "KOSK")).toEqual([]);
  });
});

describe("what a row says and does", () => {
  it("keys the reason by kind and how the post ended", () => {
    expect(reasonKey({ type: "MADRASAH", reason: "EXPIRED" })).toBe(
      "MADRASAH_EXPIRED"
    );
    expect(reasonKey({ type: "COURSE", reason: "REMOVED" })).toBe(
      "COURSE_REMOVED"
    );
    expect(assignKey("KOSK")).toBe("assign.KOSK");
  });

  it("opens a köşk and a course in Nizam, and a medrese nowhere", () => {
    expect(contentPath({ ...medrese, type: "KOSK", id: "k9" })).toBe(
      "/kosks/k9"
    );
    expect(contentPath(course)).toBe("/kosks/k1/courses/c1/edit");
    expect(contentPath(medrese)).toBeNull();
  });

  it("maps the API's codes to the page's messages", () => {
    expect(inactiveErrorKey({ code: "INACTIVE_SCOPE_NOT_FOUND" })).toBe(
      "errors.notFound"
    );
    expect(inactiveErrorKey({ code: "WHATEVER" })).toBe("errors.generic");
  });

  it("has every sentence a row can need, in all three languages", () => {
    for (const lang of ["tr", "en", "ar"] as const) {
      const page = (
        resources[lang].nizam as unknown as {
          InactivePage: {
            reasons: Record<string, string>;
            assign: Record<string, string>;
            removers: Record<string, string>;
            lastRoles: Record<string, string>;
            kinds: Record<string, string>;
          };
        }
      ).InactivePage;
      for (const type of ["KOSK", "MADRASAH", "COURSE"]) {
        for (const reason of ["EXPIRED", "REMOVED"]) {
          expect(page.reasons[`${type}_${reason}`], lang).toBeTruthy();
        }
        expect(page.assign[type], lang).toBeTruthy();
        expect(page.kinds[type], lang).toBeTruthy();
      }
      for (const key of ["SYSTEM_ADMIN", "MEDARIS_NAZIM", "KOSK_NAZIM"]) {
        expect(page.removers[key], lang).toBeTruthy();
      }
      for (const key of ["KOSK_NAZIM", "MEDRESE_BASMUDERRIS", "MUDERRIS"]) {
        expect(page.lastRoles[key], lang).toBeTruthy();
      }
    }
  });
});

const render = (ui: React.ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale="tr"
      timeZone={IST}
      messages={{ nizam: resources.tr.nizam } as never}
    >
      {ui}
    </NextIntlClientProvider>
  );

describe("InactiveView (nizam 14)", () => {
  const view = (list: InactiveScopeResponse[] | null = rows) =>
    render(<InactiveView scopes={list} />);

  it("draws the title, the notice, the heading and the count that matches the rows (criterion 1)", () => {
    const html = view();
    expect(html).toContain("Pasif kapsamlar");
    expect(html).toContain("Yönetici atandığında kapsam yeniden etkin olur");
    expect(html).toContain("Yöneticisi olmayan kapsamlar");
    expect(html).toContain("2 kapsam");
    expect(html).toContain("Zeyrek Medresesi");
    expect(html).toContain("Kasîde-i Bürde şerhi");
  });

  it("says why, since when and who the last manager was", () => {
    const html = view();
    expect(html).toContain("Başmüderrisin görev süresi doldu");
    expect(html).toContain("Son müderris görevden alındı");
    expect(html).toContain("Ayşe Nur Kılıçarslan, köşk nazımı");
    expect(html).toContain("27 Eylül 2026");
    expect(html).toContain("Abdurrahman Şeref Tunalıoğlu");
    expect(html).toContain("Halil İbrahim Sarıkaya");
    expect(html).toContain("İmam");
    expect(html).toContain("Ders · Beyazıt Köşkü");
  });

  it("carries the type filter and the assign button of each kind", () => {
    const html = view();
    for (const label of ["Tümü", "Köşk", "Medrese", "Ders"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="Başmüderris ata: Zeyrek Medresesi"');
    expect(html).toContain('aria-label="Müderris ata: Kasîde-i Bürde şerhi"');
  });

  it("offers 'İçeriği gör' for a course but not for a medrese", () => {
    const html = view();
    expect(html).toContain('aria-label="İçeriği gör: Kasîde-i Bürde şerhi"');
    expect(html).not.toContain('aria-label="İçeriği gör: Zeyrek Medresesi"');
  });

  it("says nothing is closed to everyone, because that is not what the server does", () => {
    const html = view();
    expect(html).not.toContain("kimse göremez");
  });

  it("has an empty state and an error state", () => {
    expect(view([])).toContain("Yöneticisi olmayan kapsam yok.");
    const failed = view(null);
    expect(failed).toContain("Pasif kapsamlar yüklenemedi");
    expect(failed).toContain("Yeniden dene");
  });
});
