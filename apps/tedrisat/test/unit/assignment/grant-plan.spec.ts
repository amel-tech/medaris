import { describe, expect, it } from "vitest";
import {
  checkGrantExpiry,
  earliestEnd,
  extrasBeyondGroup,
  type IHeldGrant,
  planGrants,
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
