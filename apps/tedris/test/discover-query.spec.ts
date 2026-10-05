import { describe, expect, it } from "vitest";
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
      madrasahId: null,
      q: "",
    });
  });

  it("reads each filter, and the first of a repeated one", () => {
    expect(
      parseDiscoverQuery({
        page: "3",
        madrasah: [MADRASAH, "0f6b8f74-3b61-4a63-9d3c-6bd7f8d8e1a3"],
        q: "  sarf  ",
      })
    ).toEqual({
      page: 3,
      madrasahId: MADRASAH,
      q: "sarf",
    });
  });

  it("leaves out what it does not know instead of sending it on", () => {
    const query = parseDiscoverQuery({
      page: "-2",
      madrasah: "not-a-uuid",
    });
    expect(query).toMatchObject({ page: 1, madrasahId: null });
    expect(parseDiscoverQuery({ page: "2.5" }).page).toBe(1);
  });

  it("ignores the level and field of an old link: a köşk is no longer filtered by them (MDRS-252)", () => {
    const query = parseDiscoverQuery({ level: "BEGINNER", field: "Hadis" });
    expect(query).toEqual(parseDiscoverQuery({}));
    expect(hasFilter(query)).toBe(false);
    expect(discoverHref(query)).toBe("/discover");
  });

  it("caps the search text", () => {
    expect(parseDiscoverQuery({ q: "a".repeat(300) }).q).toHaveLength(100);
  });

  it("writes only what is set, with page one left out", () => {
    expect(discoverHref({})).toBe("/discover");
    expect(discoverHref({ page: 1, madrasahId: null })).toBe("/discover");
    expect(
      discoverHref({ madrasahId: MADRASAH, q: "sarf nahiv", page: 2 })
    ).toBe(`/discover?q=sarf+nahiv&madrasah=${MADRASAH}&page=2`);
    expect(discoverHref({ q: "bina" }, "/tr/discover")).toBe(
      "/tr/discover?q=bina"
    );
  });

  it("round-trips: what is written reads back", () => {
    const query = {
      page: 4,
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
    expect(hasFilter(parseDiscoverQuery({ madrasah: MADRASAH }))).toBe(true);
  });

  it("makes at least one page, and rounds up", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(25, 12)).toBe(3);
  });
});
