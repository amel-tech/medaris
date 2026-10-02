import { describe, expect, it } from "vitest";
import { koskLevelLabel } from "~/features/courses/components/labels";
import {
  discoverHref,
  hasFilter,
  pageCount,
  parseDiscoverQuery,
} from "~/features/discover/discover-query";

const MADRASAH = "0f6b8f74-3b61-4a63-9d3c-6bd7f8d8e1a2";

describe("Keşfet's address (MDRS-159, design tedris/02)", () => {
  it("reads nothing as the first page with no filter", () => {
    expect(parseDiscoverQuery({})).toEqual({
      page: 1,
      level: null,
      field: null,
      madrasahId: null,
      q: "",
    });
  });

  it("reads each filter, and the first of a repeated one", () => {
    expect(
      parseDiscoverQuery({
        page: "3",
        level: ["INTERMEDIATE", "ADVANCED"],
        field: " Fıkıh ",
        madrasah: MADRASAH,
        q: "  sarf  ",
      })
    ).toEqual({
      page: 3,
      level: "INTERMEDIATE",
      field: "Fıkıh",
      madrasahId: MADRASAH,
      q: "sarf",
    });
  });

  it("leaves out what it does not know instead of sending it on", () => {
    const query = parseDiscoverQuery({
      page: "-2",
      level: "EXPERT",
      madrasah: "not-a-uuid",
      field: "  ",
    });
    expect(query).toMatchObject({ page: 1, level: null, madrasahId: null });
    expect(query.field).toBeNull();
    expect(parseDiscoverQuery({ page: "2.5" }).page).toBe(1);
    expect(parseDiscoverQuery({ level: "ALL" }).level).toBeNull();
  });

  it("caps the search text", () => {
    expect(parseDiscoverQuery({ q: "a".repeat(300) }).q).toHaveLength(100);
  });

  it("writes only what is set, with page one left out", () => {
    expect(discoverHref({})).toBe("/discover");
    expect(discoverHref({ page: 1, level: null })).toBe("/discover");
    expect(
      discoverHref({
        level: "INTERMEDIATE",
        field: "Fıkıh",
        madrasahId: MADRASAH,
        q: "sarf nahiv",
        page: 2,
      })
    ).toBe(
      `/discover?q=sarf+nahiv&level=INTERMEDIATE&madrasah=${MADRASAH}&field=F%C4%B1k%C4%B1h&page=2`
    );
    expect(discoverHref({ level: "BEGINNER" }, "/tr/discover")).toBe(
      "/tr/discover?level=BEGINNER"
    );
  });

  it("round-trips: what is written reads back", () => {
    const query = {
      page: 4,
      level: "ADVANCED" as const,
      field: "Arapça dil ilimleri",
      madrasahId: MADRASAH,
      q: "bina",
    };
    const search = discoverHref(query).split("?")[1] ?? "";
    const raw = Object.fromEntries(new URLSearchParams(search));
    expect(parseDiscoverQuery(raw)).toEqual(query);
  });

  it("counts a page as a filter's own business: the page is not a filter", () => {
    expect(hasFilter(parseDiscoverQuery({ page: "2" }))).toBe(false);
    expect(hasFilter(parseDiscoverQuery({ q: "x" }))).toBe(true);
    expect(hasFilter(parseDiscoverQuery({ level: "BEGINNER" }))).toBe(true);
    expect(hasFilter(parseDiscoverQuery({ field: "Hadis" }))).toBe(true);
    expect(hasFilter(parseDiscoverQuery({ madrasah: MADRASAH }))).toBe(true);
  });

  it("makes at least one page, and rounds up", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(25, 12)).toBe(3);
  });
});

describe("a köşk's level as words (design tedris/02 and 04)", () => {
  const t = (key: string, values?: Record<string, string>) =>
    key === "Levels.BEGINNER"
      ? "Başlangıç"
      : key === "Levels.INTERMEDIATE"
        ? "Orta"
        : key === "DiscoverPage.level" || key === "KoskPage.level"
          ? `${values?.level} seviyesi`
          : key === "DiscoverPage.levelAll"
            ? "Bütün seviyeler"
            : key;

  it("writes BEGINNER as 'Başlangıç seviyesi' and ALL as 'Bütün seviyeler'", () => {
    expect(koskLevelLabel("BEGINNER", t, "DiscoverPage")).toBe(
      "Başlangıç seviyesi"
    );
    expect(koskLevelLabel("INTERMEDIATE", t, "KoskPage")).toBe("Orta seviyesi");
    expect(koskLevelLabel("ALL", t, "DiscoverPage")).toBe("Bütün seviyeler");
  });

  it("writes nothing for a köşk with no level or one it does not know", () => {
    expect(koskLevelLabel(null, t, "DiscoverPage")).toBeNull();
    expect(koskLevelLabel(undefined, t, "DiscoverPage")).toBeNull();
    expect(koskLevelLabel("EXPERT", t, "DiscoverPage")).toBeNull();
  });
});
