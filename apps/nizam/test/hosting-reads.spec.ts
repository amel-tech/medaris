import type { MadrasahResponse } from "@medaris/services/tedrisat";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMadrasahOptions,
  MADRASAH_OPTIONS_PAGE_SIZE,
} from "~/features/hosting/reads";

// The API is a list of medreses served a page at a time, as the real one does.
let medreses: MadrasahResponse[] = [];
const getAllMadrasahs = vi.fn(
  async ({ page = 1, limit = 12 }: { page?: number; limit?: number }) => ({
    items: medreses.slice((page - 1) * limit, page * limit),
    total: medreses.length,
    page,
    limit,
  })
);
vi.mock("@medaris/services/tedrisat", async (original) => ({
  ...(await original<object>()),
  createServerTedrisatAPIs: async () => ({ madrasahs: { getAllMadrasahs } }),
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => "token" }));

const madrasah = (n: number) => ({ id: `m${n}` }) as MadrasahResponse;
const make = (count: number) =>
  Array.from({ length: count }, (_, i) => madrasah(i + 1));

describe("getMadrasahOptions (the picker of Barındırma hakkı ver)", () => {
  beforeEach(() => {
    getAllMadrasahs.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reads past the first page, so the 51st medrese is offered too", async () => {
    medreses = make(MADRASAH_OPTIONS_PAGE_SIZE + 1);
    const options = await getMadrasahOptions();
    expect(options?.map((m) => m.id)).toEqual(medreses.map((m) => m.id));
    expect(getAllMadrasahs).toHaveBeenCalledTimes(2);
    expect(getAllMadrasahs).toHaveBeenLastCalledWith({
      page: 2,
      limit: MADRASAH_OPTIONS_PAGE_SIZE,
    });
  });

  it("asks once when everything fits one page, and for nothing when there is no medrese", async () => {
    medreses = make(3);
    expect(await getMadrasahOptions()).toHaveLength(3);
    expect(getAllMadrasahs).toHaveBeenCalledTimes(1);

    getAllMadrasahs.mockClear();
    medreses = [];
    expect(await getMadrasahOptions()).toEqual([]);
    expect(getAllMadrasahs).toHaveBeenCalledTimes(1);
  });

  it("stops at an empty page even when the total says more", async () => {
    medreses = make(2);
    getAllMadrasahs.mockResolvedValueOnce({
      items: medreses,
      total: 99,
      page: 1,
      limit: MADRASAH_OPTIONS_PAGE_SIZE,
    });
    getAllMadrasahs.mockResolvedValueOnce({
      items: [],
      total: 99,
      page: 2,
      limit: MADRASAH_OPTIONS_PAGE_SIZE,
    });
    expect(await getMadrasahOptions()).toHaveLength(2);
    expect(getAllMadrasahs).toHaveBeenCalledTimes(2);
  });

  it("is null when a page fails, not a short list", async () => {
    medreses = make(MADRASAH_OPTIONS_PAGE_SIZE + 1);
    getAllMadrasahs.mockImplementationOnce(async () => ({
      items: medreses.slice(0, MADRASAH_OPTIONS_PAGE_SIZE),
      total: medreses.length,
      page: 1,
      limit: MADRASAH_OPTIONS_PAGE_SIZE,
    }));
    getAllMadrasahs.mockRejectedValueOnce(new Error("down"));
    expect(await getMadrasahOptions()).toBeNull();
  });
});
