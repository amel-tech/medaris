import { describe, expect, it } from "vitest";
import {
  COURSE_CATALOG,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from "../../../src/assignment/permission-catalog";
import { ASSIGNED_ROLES } from "../../../src/database/schema/role-assignment.schema";
import {
  checkRequestedCodes,
  grantableCourseCodes,
} from "../../../src/kosk/kosk-grants-rules";

describe("grantableCourseCodes (nizam/38, criterion 2)", () => {
  it("opens the whole course catalog to a köşk nazımı, who holds course.manage_all by default", () => {
    const held = ROLE_DEFAULT_PERMISSIONS[ASSIGNED_ROLES.KOSK_NAZIM];
    expect(grantableCourseCodes(held)).toEqual(COURSE_CATALOG);
  });

  it("hands on nothing without course.manage_all", () => {
    expect(grantableCourseCodes([PERMISSIONS.KOSK_MANAGE])).toEqual([]);
    expect(grantableCourseCodes([])).toEqual([]);
  });
});

describe("checkRequestedCodes", () => {
  it("de-duplicates and keeps the order asked", () => {
    const result = checkRequestedCodes(
      [
        PERMISSIONS.COURSE_EDIT,
        PERMISSIONS.SESSION_MANAGE,
        PERMISSIONS.COURSE_EDIT,
      ],
      COURSE_CATALOG
    );
    expect(result.codes).toEqual([
      PERMISSIONS.COURSE_EDIT,
      PERMISSIONS.SESSION_MANAGE,
    ]);
    expect(result.unknown).toEqual([]);
    expect(result.beyondGiver).toEqual([]);
  });

  it("calls a code outside the course catalog unknown, whoever holds it", () => {
    const result = checkRequestedCodes(
      [PERMISSIONS.PLATFORM_AUDIT_READ, PERMISSIONS.KOSK_MANAGE, "nope"],
      COURSE_CATALOG
    );
    expect(result.unknown).toEqual([
      PERMISSIONS.PLATFORM_AUDIT_READ,
      PERMISSIONS.KOSK_MANAGE,
      "nope",
    ]);
    expect(result.beyondGiver).toEqual([]);
  });

  it("names a catalog code the giver does not hold as beyond them", () => {
    const result = checkRequestedCodes(
      [PERMISSIONS.COURSE_EDIT, PERMISSIONS.BAN_COURSE],
      [PERMISSIONS.COURSE_EDIT]
    );
    expect(result.unknown).toEqual([]);
    expect(result.beyondGiver).toEqual([PERMISSIONS.BAN_COURSE]);
  });
});
