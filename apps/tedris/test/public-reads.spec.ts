import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reads that carry recordings never keep them in Next's data cache
 * (MDRS-114): a Bunny recording's `url` is a player link signed for this
 * viewer, with its own expiry, so it is read at render time for each request.
 */

const listCourseRecordings = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@medaris/services/tedrisat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@medaris/services/tedrisat")>()),
  createServerTedrisatAPIs: async () => ({
    lessons: { listCourseRecordings, getSession },
  }),
}));
vi.mock("~/lib/auth_options", () => ({ getAccessToken: async () => "token" }));

beforeEach(() => {
  listCourseRecordings.mockReset().mockResolvedValue([]);
  getSession.mockReset().mockResolvedValue({ id: "s1" });
});

describe("reads of signed player links (MDRS-114)", () => {
  it("asks for a course's recordings with no-store", async () => {
    const { getRecordings } = await import("~/features/courses/public-reads");
    await getRecordings("c1");
    expect(listCourseRecordings).toHaveBeenCalledWith(
      { id: "c1" },
      { cache: "no-store" }
    );
  });

  it("asks for a session, and its recording, with no-store", async () => {
    const { getSession: read } = await import(
      "~/features/courses/public-reads"
    );
    expect(await read("c1", "s1")).toEqual({ id: "s1" });
    expect(getSession).toHaveBeenCalledWith(
      { courseId: "c1", sessionId: "s1" },
      { cache: "no-store" }
    );
  });
});
