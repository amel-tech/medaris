import { ResponseError } from "@medaris/services/tedrisat";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCourseById = vi.hoisted(() => vi.fn());
vi.mock("@medaris/services/tedrisat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/tedrisat")>()),
  createServerTedrisatAPIs: async () => ({ courses: { getCourseById } }),
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => "token" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const answer = (status: number) =>
  new ResponseError(new Response(null, { status }), "refused");

beforeEach(() => {
  getCourseById.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("tedris/38 and 40: what a failed course read means", () => {
  it.each([
    400, 401, 403, 404,
  ])("the API's %i is an answer about the course: null, so the page is not-found", async (status) => {
    getCourseById.mockRejectedValue(answer(status));
    const { getCourse } = await import("~/features/courses/actions");
    expect(await getCourse("c-1")).toBeNull();
  });

  it.each([
    500, 502, 503,
  ])("the API's %i is a failure to ask: it throws, so the error page answers", async (status) => {
    getCourseById.mockRejectedValue(answer(status));
    const { getCourse } = await import("~/features/courses/actions");
    await expect(getCourse("c-1")).rejects.toBeInstanceOf(ResponseError);
  });

  it("an unreachable API throws too", async () => {
    getCourseById.mockRejectedValue(new TypeError("fetch failed"));
    const { getCourse } = await import("~/features/courses/actions");
    await expect(getCourse("c-1")).rejects.toThrow("fetch failed");
  });

  it("returns the course when the API has it", async () => {
    getCourseById.mockResolvedValue({ id: "c-1" });
    const { getCourse } = await import("~/features/courses/actions");
    expect(await getCourse("c-1")).toEqual({ id: "c-1" });
  });
});
