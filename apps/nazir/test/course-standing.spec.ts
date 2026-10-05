import type { EffectivePermissionGroup } from "@medaris/services/tedrisat";
import { describe, expect, it, vi } from "vitest";

const getEffectivePermissions = vi.fn();
vi.mock("~/features/account/reads", () => ({
  getEffectivePermissions: () => getEffectivePermissions(),
}));

import {
  courseAccess,
  holdsInCourse,
} from "~/features/account/course-standing";

const group = (
  over: Partial<EffectivePermissionGroup> = {}
): EffectivePermissionGroup => ({
  role: "DERS_NAZIR",
  scopeType: "course",
  scopes: [{ type: "course", id: "c-1", name: "Bina" }],
  permissions: ["recording.manage"],
  ...over,
});

describe("holdsInCourse", () => {
  it("is true for a course group that lists the course and carries a code", () => {
    expect(holdsInCourse([group()], "c-1", ["recording.manage"])).toBe(true);
    expect(
      holdsInCourse([group()], "c-1", ["course.edit", "recording.manage"])
    ).toBe(true);
  });

  it("reads a scope without an id as every course", () => {
    const every = group({ scopes: [{ type: "course" }] });
    expect(holdsInCourse([every], "c-9", ["recording.manage"])).toBe(true);
  });

  it("is false for another course, another code, a scope of another type, or nothing", () => {
    expect(holdsInCourse([group()], "c-2", ["recording.manage"])).toBe(false);
    expect(holdsInCourse([group()], "c-1", ["course.edit"])).toBe(false);
    expect(
      holdsInCourse(
        [group({ scopeType: "kosk", scopes: [{ type: "kosk", id: "c-1" }] })],
        "c-1",
        ["recording.manage"]
      )
    ).toBe(false);
    expect(holdsInCourse([], "c-1", ["recording.manage"])).toBe(false);
  });
});

describe("courseAccess", () => {
  it("opens an unlocked course without reading permissions", async () => {
    getEffectivePermissions.mockReset();
    await expect(
      courseAccess({ contentLocked: false }, "c-1", ["recording.manage"])
    ).resolves.toBe("ok");
    expect(getEffectivePermissions).not.toHaveBeenCalled();
  });

  it("answers a locked course from the permissions", async () => {
    getEffectivePermissions.mockResolvedValue([group()]);
    await expect(
      courseAccess({ contentLocked: true }, "c-1", ["recording.manage"])
    ).resolves.toBe("ok");
    await expect(
      courseAccess({ contentLocked: true }, "c-1", ["course.edit"])
    ).resolves.toBe("forbidden");
  });

  it("is failed, not forbidden, when the permissions cannot be read", async () => {
    getEffectivePermissions.mockResolvedValue(null);
    await expect(
      courseAccess({ contentLocked: true }, "c-1", ["recording.manage"])
    ).resolves.toBe("failed");
  });
});
