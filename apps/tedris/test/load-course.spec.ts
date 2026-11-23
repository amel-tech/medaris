import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCourse: vi.fn(),
  isSignedIn: vi.fn(),
}));
vi.mock("~/features/courses/actions", () => ({ getCourse: mocks.getCourse }));
vi.mock("~/features/courses/public-reads", () => ({
  isSignedIn: mocks.isSignedIn,
}));
// Next's own redirect() and notFound() throw to end the render; so do these.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));

beforeEach(() => {
  mocks.getCourse.mockReset();
  mocks.isSignedIn.mockReset();
});

// The course segment's layout reads the course before the page does, so the
// way out has to be decided there: a notFound() in the layout once ended the
// request before the page's sign-in redirect could run (MDRS-248).
describe("loadCourseOrLeave: what the course segment does with the API's answer", () => {
  it("returns the course the API gave", async () => {
    const course = { id: "c-1" };
    mocks.getCourse.mockResolvedValue(course);
    const { loadCourseOrLeave } = await import(
      "~/features/courses/load-course"
    );
    await expect(loadCourseOrLeave("c-1")).resolves.toBe(course);
  });

  it("sends a signed-out visitor to sign in and back, as an unlisted course needs", async () => {
    mocks.getCourse.mockResolvedValue(null);
    mocks.isSignedIn.mockResolvedValue(false);
    const { loadCourseOrLeave } = await import(
      "~/features/courses/load-course"
    );
    await expect(loadCourseOrLeave("c-2")).rejects.toThrow(
      `redirect /auth/signin?callbackUrl=${encodeURIComponent("/courses/c-2")}`
    );
  });

  it("answers 404 to a signed-in caller the API gave no course", async () => {
    mocks.getCourse.mockResolvedValue(null);
    mocks.isSignedIn.mockResolvedValue(true);
    const { loadCourseOrLeave } = await import(
      "~/features/courses/load-course"
    );
    await expect(loadCourseOrLeave("c-3")).rejects.toThrow("notFound");
  });
});

describe("the course segment's layout leaves through loadCourseOrLeave", () => {
  it("the layout and the page both call it", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    for (const file of ["layout.tsx", "page.tsx"]) {
      const source = await readFile(
        fileURLToPath(
          new URL(`../app/courses/[courseId]/${file}`, import.meta.url)
        ),
        "utf8"
      );
      expect(source, file).toContain("loadCourseOrLeave(courseId)");
    }
  });
});
