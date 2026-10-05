import { beforeEach, describe, expect, it, vi } from "vitest";

const readOnce = vi.fn();
vi.mock("~/lib/tedrisat-read", () => ({
  readOnce: (what: string, call: (api: unknown) => Promise<unknown>) =>
    readOnce(what, call),
}));

import {
  type CoursePermissions,
  holds,
  holdsAny,
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";

const set = (...codes: string[]): CoursePermissions => new Set(codes);
const ok = <T>(data: T) => ({ status: "ok", data }) as const;

describe("what is held", () => {
  it("is a code in the set, and any of several", () => {
    expect(holds(set("session.manage"), "session.manage")).toBe(true);
    expect(holds(set("session.manage"), "course.edit")).toBe(false);
    expect(
      holdsAny(set("course.edit"), ["course.edit", "session.manage"])
    ).toBe(true);
    expect(holdsAny(set(), ["course.edit"])).toBe(false);
  });
});

describe("the read", () => {
  beforeEach(() => {
    readOnce.mockReset();
  });

  it("asks for this course's permissions and answers a set", async () => {
    const getMyCoursePermissions = vi.fn(async () => ({
      permissions: ["course.view", "enrollment.decide"],
      staffRead: true,
    }));
    readOnce.mockImplementation(async (_what, call) =>
      ok(await call({ courses: { getMyCoursePermissions } }))
    );
    const read = await readCoursePermissions("c-1");
    expect(getMyCoursePermissions).toHaveBeenCalledWith({ id: "c-1" });
    expect(read.status).toBe("ok");
    if (read.status === "ok") {
      expect([...read.data].sort()).toEqual([
        "course.view",
        "enrollment.decide",
      ]);
    }
  });

  it("keeps a refusal and a failure as they are, never as an empty set", async () => {
    readOnce.mockResolvedValueOnce({ status: "failed" });
    expect(await readCoursePermissions("c-1")).toEqual({ status: "failed" });
    readOnce.mockResolvedValueOnce({ status: "forbidden" });
    expect(await readCoursePermissions("c-1")).toEqual({
      status: "forbidden",
    });
  });
});

describe("whether a page opens", () => {
  const course = ok({});

  it("opens when the caller holds any code of the page", () => {
    expect(
      pageGate([course], ok(set("session.live_link")), PAGE_CODES.sessions)
    ).toBe("ok");
    expect(
      pageGate([course], ok(set("recording.manage")), PAGE_CODES.recordings)
    ).toBe("ok");
    expect(
      pageGate([course], ok(set("recording.upload")), PAGE_CODES.recordings)
    ).toBe("ok");
  });

  it("is forbidden when the caller holds none of them, however much else", () => {
    expect(
      pageGate(
        [course],
        ok(set("course.view", "course.view_details", "recording.manage")),
        PAGE_CODES.curriculum
      )
    ).toBe("forbidden");
    expect(pageGate([course], ok(set()), PAGE_CODES.students)).toBe(
      "forbidden"
    );
  });

  it("names the codes each page asks, from the routes it calls", () => {
    expect(PAGE_CODES.sessions).toEqual([
      "session.manage",
      "session.live_link",
    ]);
    expect(PAGE_CODES.plan).toEqual(["session.manage"]);
    expect(PAGE_CODES.nazirs).toEqual(["course_nazir.assign"]);
    expect(PAGE_CODES.curriculum).toEqual([
      "course.edit",
      "session.manage",
      "week.hide",
    ]);
    // Ders kayıtları: pasting a link asks the first, uploading to Bunny the second
    expect(PAGE_CODES.recordings).toEqual([
      "recording.manage",
      "recording.upload",
    ]);
    expect(PAGE_CODES.students).toEqual([
      "course.staff_read",
      "enrollment.decide",
      "enrollment.complete",
      "enrollment.remove",
    ]);
  });

  it("is the retry state when any read failed, and never an answer either way", () => {
    const held = ok(set("session.manage"));
    expect(pageGate([{ status: "failed" }], held, PAGE_CODES.sessions)).toBe(
      "failed"
    );
    expect(pageGate([course], { status: "failed" }, PAGE_CODES.sessions)).toBe(
      "failed"
    );
    // a failure wins over a refusal, so the retry can still find the answer
    expect(pageGate([{ status: "forbidden" }], { status: "failed" }, [])).toBe(
      "failed"
    );
  });

  it("is forbidden when a read was refused", () => {
    expect(
      pageGate(
        [{ status: "forbidden" }],
        ok(set("session.manage")),
        PAGE_CODES.sessions
      )
    ).toBe("forbidden");
    expect(
      pageGate([course], { status: "forbidden" }, PAGE_CODES.sessions)
    ).toBe("forbidden");
  });
});
