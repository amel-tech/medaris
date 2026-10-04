import { describe, expect, it } from "vitest";
import {
  isPermissionCode,
  MADRASAH_CATALOG,
  MADRASAH_COURSE_CATALOG,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from "../../../src/assignment/permission-catalog";
import {
  courseScopeProblem,
  describeHeldGrants,
  extrasToStore,
  type IHeldTreeGrant,
  wantedScopes,
} from "../../../src/madrasah/nazir/nazir-grant-scopes";

/**
 * MDRS-185, nazir/06: where the dialog's choices are stored and how they are
 * read back. The routes end to end are test/e2e/madrasah-permission.e2e.spec.ts.
 */
const M = "c5000000-0000-4000-8000-0000000000aa";
const C1 = "c5000000-0000-4000-8000-0000000000c1";
const C2 = "c5000000-0000-4000-8000-0000000000c2";
const G = "c5000000-0000-4000-8000-0000000000e1";

const mixedGroup = { id: G, permissions: ["madrasah.ban", "course.edit"] };
const courseGroup = { id: G, permissions: ["course.edit", "session.manage"] };

describe("the medrese's permission dictionary", () => {
  // nazir/06 prints ten medrese permissions and the twenty a müderris holds by
  // default; the owner's 1 October list adds "request a non-medrese course in a
  // köşk" (medrese) and "propose a köşk deck" (course); `question.answer`
  // (MDRS-150) is the twenty-second course permission.
  it("has the eleven medrese permissions and the twenty-two course permissions the dialogs print", () => {
    expect(MADRASAH_CATALOG).toHaveLength(11);
    expect(MADRASAH_COURSE_CATALOG).toHaveLength(22);
  });

  it("offers a nazır every course permission a müderris holds, but the one to give permissions", () => {
    expect([...MADRASAH_COURSE_CATALOG].sort()).toEqual(
      ROLE_DEFAULT_PERMISSIONS.MUDERRIS.filter(
        (code) => code !== PERMISSIONS.PERMISSION_GRANT
      ).sort()
    );
  });

  it("keeps every code a catalog code and the two sections apart", () => {
    for (const code of [...MADRASAH_CATALOG, ...MADRASAH_COURSE_CATALOG]) {
      expect(isPermissionCode(code)).toBe(true);
    }
    expect(
      MADRASAH_CATALOG.filter((c) => MADRASAH_COURSE_CATALOG.includes(c))
    ).toEqual([]);
    expect(MADRASAH_CATALOG.every((c) => c.startsWith("madrasah."))).toBe(true);
  });
});

describe("wantedScopes", () => {
  it("holds the medrese permissions in the medrese and, for every course, the course ones there too", () => {
    expect(
      wantedScopes({
        madrasahId: M,
        group: null,
        permissions: ["madrasah.ban", "course.edit"],
        courseIds: null,
      })
    ).toEqual([
      {
        scopeType: "madrasah",
        scopeId: M,
        groupId: null,
        permissions: ["madrasah.ban", "course.edit"],
      },
    ]);
  });

  it("holds the course permissions course by course when courses are named, the medrese ones in the medrese", () => {
    const scopes = wantedScopes({
      madrasahId: M,
      group: null,
      permissions: ["madrasah.ban", "course.edit"],
      courseIds: [C1, C2, C1],
    });
    expect(scopes).toEqual([
      {
        scopeType: "madrasah",
        scopeId: M,
        groupId: null,
        permissions: ["madrasah.ban"],
      },
      {
        scopeType: "course",
        scopeId: C1,
        groupId: null,
        permissions: ["course.edit"],
      },
      {
        scopeType: "course",
        scopeId: C2,
        groupId: null,
        permissions: ["course.edit"],
      },
    ]);
  });

  it("puts a group with a medrese permission in the medrese", () => {
    expect(
      wantedScopes({
        madrasahId: M,
        group: mixedGroup,
        permissions: [],
        courseIds: null,
      })
    ).toEqual([
      { scopeType: "madrasah", scopeId: M, groupId: G, permissions: [] },
    ]);
  });

  it("puts a course-only group in each chosen course, or in the medrese for every course", () => {
    expect(
      wantedScopes({
        madrasahId: M,
        group: courseGroup,
        permissions: [],
        courseIds: [C1, C2],
      }).map((s) => [s.scopeType, s.scopeId, s.groupId])
    ).toEqual([
      ["course", C1, G],
      ["course", C2, G],
    ]);
    expect(
      wantedScopes({
        madrasahId: M,
        group: courseGroup,
        permissions: [],
        courseIds: null,
      }).map((s) => [s.scopeType, s.scopeId, s.groupId])
    ).toEqual([["madrasah", M, G]]);
  });

  it("wants nothing when nothing is given", () => {
    expect(
      wantedScopes({
        madrasahId: M,
        group: null,
        permissions: [],
        courseIds: null,
      })
    ).toEqual([]);
  });
});

describe("courseScopeProblem", () => {
  it("has no problem with every course", () => {
    expect(courseScopeProblem(mixedGroup, [], null)).toBeNull();
  });

  it.each([
    ["no course chosen", null, [], [], "none-chosen"],
    [
      "a group that spans the medrese",
      mixedGroup,
      ["course.edit"],
      [C1],
      "group-spans-medrese",
    ],
    [
      "nothing course-level to limit",
      null,
      ["madrasah.ban"],
      [C1],
      "no-course-permissions",
    ],
  ] as const)("names %s", (_what, group, extras, courseIds, problem) => {
    expect(courseScopeProblem(group, extras, courseIds as string[])).toBe(
      problem
    );
  });

  it("accepts a course-only group or a course extra with chosen courses", () => {
    expect(courseScopeProblem(courseGroup, [], [C1])).toBeNull();
    expect(courseScopeProblem(null, ["course.edit"], [C1])).toBeNull();
  });
});

describe("extrasToStore", () => {
  it("drops what the group already carries and repeats", () => {
    expect(
      extrasToStore(
        ["course.edit", "madrasah.ban", "madrasah.ban"],
        courseGroup
      )
    ).toEqual(["madrasah.ban"]);
    expect(extrasToStore(["course.edit"], null)).toEqual(["course.edit"]);
  });
});

describe("describeHeldGrants", () => {
  const at = (day: number) => new Date(Date.UTC(2026, 11, day));
  const row = (over: Partial<IHeldTreeGrant>): IHeldTreeGrant => ({
    scopeType: "madrasah",
    scopeId: M,
    permission: null,
    groupId: null,
    expiresAt: null,
    ...over,
  });

  it("reads the group, the singles, the courses and the earliest end", () => {
    expect(
      describeHeldGrants([
        row({ groupId: G, expiresAt: at(20) }),
        row({ permission: "madrasah.ban", expiresAt: at(10) }),
        row({
          scopeType: "course",
          scopeId: C1,
          permission: "course.edit",
          expiresAt: at(20),
        }),
        row({
          scopeType: "course",
          scopeId: C2,
          permission: "course.edit",
          expiresAt: at(20),
        }),
      ])
    ).toEqual({
      groupId: G,
      permissions: ["madrasah.ban", "course.edit"],
      courseIds: [C1, C2],
      expiresAt: at(10),
    });
  });

  it("reads nothing as no group, no permissions, every course and no end", () => {
    expect(describeHeldGrants([])).toEqual({
      groupId: null,
      permissions: [],
      courseIds: null,
      expiresAt: null,
    });
  });
});
