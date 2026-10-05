import { describe, expect, it } from "vitest";
import {
  checkGrantExpiry,
  earliestEnd,
  extrasBeyondGroup,
  type IHeldGrant,
  type IHeldPostGrant,
  planGrants,
  planPostGrants,
} from "../../../src/assignment/admin/grant-plan";
import {
  COURSE_CATALOG,
  COURSE_CODES,
  PERMISSIONS,
  PLATFORM_CATALOG,
  PLATFORM_CODES,
} from "../../../src/assignment/permission-catalog";

const day = (n: number) => new Date(Date.UTC(2026, 11, n));
const held = (over: Partial<IHeldGrant> & { id: string }): IHeldGrant => ({
  permission: null,
  groupId: null,
  expiresAt: null,
  ...over,
});

describe("planGrants (MDRS-171)", () => {
  it("leaves rows that stay untouched and adds only what is new", () => {
    const plan = planGrants(
      [
        held({ id: "g", groupId: "grp" }),
        held({ id: "p1", permission: "platform.audit_read" }),
      ],
      {
        groupId: "grp",
        permissions: ["platform.audit_read", "platform.policy_edit"],
        expiresAt: null,
      }
    );
    expect(plan.revoke).toEqual([]);
    expect(plan.retime).toEqual([]);
    expect(plan.insert).toEqual([{ permission: "platform.policy_edit" }]);
  });

  it("revokes the old group and adds the new one when the group changes", () => {
    const plan = planGrants([held({ id: "g", groupId: "old" })], {
      groupId: "new",
      permissions: [],
      expiresAt: null,
    });
    expect(plan.revoke).toEqual(["g"]);
    expect(plan.insert).toEqual([{ groupId: "new" }]);
  });

  it("'Grup yok' revokes the group and keeps the single permissions", () => {
    const plan = planGrants(
      [
        held({ id: "g", groupId: "grp" }),
        held({ id: "p", permission: "platform.kosk_edit" }),
      ],
      { groupId: null, permissions: ["platform.kosk_edit"], expiresAt: null }
    );
    expect(plan.revoke).toEqual(["g"]);
    expect(plan.insert).toEqual([]);
  });

  it("revokes a permission that is no longer wanted and a duplicate row", () => {
    const plan = planGrants(
      [
        held({ id: "a", permission: "platform.kosk_edit" }),
        held({ id: "b", permission: "platform.kosk_edit" }),
        held({ id: "c", permission: "platform.policy_edit" }),
      ],
      { groupId: null, permissions: ["platform.kosk_edit"], expiresAt: null }
    );
    expect(plan.revoke).toEqual(["b", "c"]);
  });

  it("gives kept rows the new end", () => {
    const plan = planGrants(
      [held({ id: "p", permission: "platform.kosk_edit", expiresAt: day(31) })],
      {
        groupId: null,
        permissions: ["platform.kosk_edit"],
        expiresAt: day(20),
      }
    );
    expect(plan.retime).toEqual(["p"]);
    const same = planGrants(
      [held({ id: "p", permission: "platform.kosk_edit", expiresAt: day(20) })],
      {
        groupId: null,
        permissions: ["platform.kosk_edit"],
        expiresAt: new Date(day(20)),
      }
    );
    expect(same.retime).toEqual([]);
  });
});

describe("planPostGrants (MDRS-270)", () => {
  const row = (
    over: Partial<IHeldPostGrant> & { id: string }
  ): IHeldPostGrant => ({
    permission: null,
    groupId: null,
    expiresAt: null,
    authority: null,
    ...over,
  });
  const nothing = {
    revoke: [],
    shorten: [],
    extendInPlace: [],
    extendAlongside: [],
    insert: [],
  };

  it("revokes a code left out with the rows riding along", () => {
    const plan = planPostGrants(
      [
        row({ id: "lead", permission: "session.manage" }),
        row({ id: "rider", permission: "session.manage", expiresAt: day(5) }),
        row({ id: "kept", permission: "week.hide" }),
      ],
      { permissions: ["week.hide"], expiresAt: null, actor: "course" }
    );
    expect(plan).toEqual({ ...nothing, revoke: ["lead", "rider"] });
  });

  it("revokes a group row", () => {
    const plan = planPostGrants(
      [
        row({ id: "g", groupId: "grp" }),
        row({ id: "p", permission: "week.hide" }),
      ],
      { permissions: ["week.hide"], expiresAt: null, actor: "kosk" }
    );
    expect(plan).toEqual({ ...nothing, revoke: ["g"] });
  });

  it("inserts a new code", () => {
    const plan = planPostGrants([row({ id: "p", permission: "week.hide" })], {
      permissions: ["week.hide", "recording.manage"],
      expiresAt: null,
      actor: "course",
    });
    expect(plan).toEqual({ ...nothing, insert: ["recording.manage"] });
  });

  it("moves a lead later in place when the actor reaches its authority", () => {
    const held = [
      row({ id: "own", permission: "week.hide", expiresAt: day(5) }),
      row({
        id: "older",
        permission: "session.manage",
        expiresAt: day(5),
        authority: null,
      }),
      row({
        id: "below",
        permission: "recording.manage",
        expiresAt: day(5),
        authority: "course",
      }),
    ];
    // the same level, an old row counted at its course's level, and a köşk over a course
    expect(
      planPostGrants(held.slice(0, 2), {
        permissions: ["week.hide", "session.manage"],
        expiresAt: day(20),
        actor: "course",
      })
    ).toEqual({ ...nothing, extendInPlace: ["own", "older"] });
    expect(
      planPostGrants(held.slice(2), {
        permissions: ["recording.manage"],
        expiresAt: null,
        actor: "kosk",
      })
    ).toEqual({ ...nothing, extendInPlace: ["below"] });
  });

  it("adds a row beside a lead stored above the actor", () => {
    const held = [
      row({
        id: "admin",
        permission: "session.manage",
        expiresAt: day(5),
        authority: "platform",
      }),
      row({
        id: "kosk",
        permission: "week.hide",
        expiresAt: day(5),
        authority: "kosk",
      }),
    ];
    expect(
      planPostGrants(held, {
        permissions: ["session.manage", "week.hide"],
        expiresAt: day(20),
        actor: "course",
      })
    ).toEqual({
      ...nothing,
      extendAlongside: [
        { id: "admin", permission: "session.manage" },
        { id: "kosk", permission: "week.hide" },
      ],
    });
    // a köşk and a medrese are not above one another
    expect(
      planPostGrants(held.slice(1), {
        permissions: ["week.hide"],
        expiresAt: null,
        actor: "madrasah",
      }).extendAlongside
    ).toEqual([{ id: "kosk", permission: "week.hide" }]);
  });

  it("shortens a lead and every rider running past an earlier end", () => {
    const plan = planPostGrants(
      [
        row({
          id: "lead",
          permission: "session.manage",
          authority: "platform",
        }),
        row({
          id: "past",
          permission: "session.manage",
          expiresAt: day(25),
          authority: "course",
        }),
        row({
          id: "inside",
          permission: "session.manage",
          expiresAt: day(8),
          authority: "course",
        }),
      ],
      { permissions: ["session.manage"], expiresAt: day(10), actor: "course" }
    );
    // shortening gives nothing, so even a row from above is shortened in place
    expect(plan).toEqual({ ...nothing, shorten: ["lead", "past"] });
  });

  it("touches nothing when the end and the set are the same", () => {
    const plan = planPostGrants(
      [
        row({ id: "a", permission: "week.hide", expiresAt: day(20) }),
        row({ id: "b", permission: "session.manage", expiresAt: day(20) }),
        row({ id: "rider", permission: "session.manage", expiresAt: day(3) }),
      ],
      {
        permissions: ["session.manage", "week.hide"],
        expiresAt: new Date(day(20)),
        actor: "course",
      }
    );
    expect(plan).toEqual(nothing);
  });
});

describe("extrasBeyondGroup", () => {
  it("drops what the group carries and what is listed twice", () => {
    expect(extrasBeyondGroup(["a", "b", "b", "c"], ["a", "x"])).toEqual([
      "b",
      "c",
    ]);
  });
});

describe("checkGrantExpiry", () => {
  const now = day(10);
  it("accepts no end, and an end inside the appointment", () => {
    expect(checkGrantExpiry(null, day(31), now)).toBeNull();
    expect(checkGrantExpiry(day(20), day(31), now)).toBeNull();
    expect(checkGrantExpiry(day(31), day(31), now)).toBeNull();
    expect(checkGrantExpiry(day(20), null, now)).toBeNull();
  });
  it("refuses the past and a day after the appointment", () => {
    expect(checkGrantExpiry(day(9), null, now)).toBe("past");
    expect(checkGrantExpiry(day(10), null, now)).toBe("past");
    expect(checkGrantExpiry(day(30), day(20), now)).toBe("after-assignment");
  });
});

describe("earliestEnd", () => {
  it("is the earliest date, or null when nothing ends", () => {
    expect(earliestEnd([day(31), null, day(15)])).toEqual(day(15));
    expect(earliestEnd([null, undefined])).toBeNull();
  });
});

describe("the catalog", () => {
  it("has the 18 platform codes the screens draw, each once", () => {
    const codes = PLATFORM_CATALOG.flatMap((s) => s.permissions);
    expect(PLATFORM_CATALOG.map((s) => s.permissions.length)).toEqual([
      5, 4, 3, 2, 4,
    ]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(PLATFORM_CODES.size).toBe(18);
    // Platform management's course hide (MDRS-143) can be handed to a Medaris nazımı.
    expect(PLATFORM_CODES.has(PERMISSIONS.PLATFORM_COURSE_HIDE)).toBe(true);
  });
  it("keeps the platform and the course halves apart", () => {
    for (const code of COURSE_CATALOG)
      expect(PLATFORM_CODES.has(code)).toBe(false);
    expect(COURSE_CODES.has(PERMISSIONS.COURSE_EDIT)).toBe(true);
    expect(COURSE_CODES.has(PERMISSIONS.USER_LOOKUP)).toBe(false);
    expect(COURSE_CODES.has(PERMISSIONS.PERMISSION_GROUP_DEFINE)).toBe(false);
  });
});
