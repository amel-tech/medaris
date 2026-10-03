import {
  BAN_TIERS,
  highestRole,
  mayLift,
  RUNS_COURSE_ROLES,
  RUNS_MADRASAH_ROLES,
  SYSTEM_ADMIN_ROLE,
  tierOfRole,
} from "../../../src/ban/ban-tier";
import { ASSIGNED_ROLES } from "../../../src/database/schema/role-assignment.schema";

describe("ban tiers (MDRS-177, ordering only since MDRS-205)", () => {
  it("ranks the roles the way the designs read them", () => {
    expect(tierOfRole(ASSIGNED_ROLES.MUDERRIS)).toBe(BAN_TIERS.COURSE);
    expect(tierOfRole(ASSIGNED_ROLES.DERS_NAZIR)).toBe(BAN_TIERS.COURSE);
    expect(tierOfRole(ASSIGNED_ROLES.MEDRESE_NAZIR)).toBe(BAN_TIERS.MADRASAH);
    expect(tierOfRole(ASSIGNED_ROLES.KOSK_NAZIM)).toBe(BAN_TIERS.KOSK);
    expect(tierOfRole(ASSIGNED_ROLES.MEDARIS_NAZIM)).toBe(BAN_TIERS.PLATFORM);
    expect(tierOfRole(SYSTEM_ADMIN_ROLE)).toBe(BAN_TIERS.PLATFORM);
  });

  it("lets a ban be lifted by the kademe that placed it or a higher one", () => {
    expect(mayLift(BAN_TIERS.COURSE, BAN_TIERS.COURSE)).toBe(true);
    expect(mayLift(BAN_TIERS.KOSK, BAN_TIERS.COURSE)).toBe(true);
    expect(mayLift(BAN_TIERS.KOSK, BAN_TIERS.MADRASAH)).toBe(true);
    expect(mayLift(BAN_TIERS.COURSE, BAN_TIERS.KOSK)).toBe(false);
    // A Medaris nazımı's ban is Medaris administration's alone.
    expect(mayLift(BAN_TIERS.KOSK, BAN_TIERS.PLATFORM)).toBe(false);
    expect(mayLift(BAN_TIERS.PLATFORM, BAN_TIERS.PLATFORM)).toBe(true);
  });

  it("picks the highest-ranked role of those held", () => {
    expect(highestRole([])).toBeNull();
    expect(
      highestRole([
        { role: ASSIGNED_ROLES.MUDERRIS },
        { role: ASSIGNED_ROLES.KOSK_NAZIM },
      ])
    ).toBe(ASSIGNED_ROLES.KOSK_NAZIM);
  });

  it("protects those who run a course from a ban, and the medrese's own roles in a medrese's courses", () => {
    for (const role of [
      ASSIGNED_ROLES.MUDERRIS,
      ASSIGNED_ROLES.DERS_NAZIR,
      ASSIGNED_ROLES.KOSK_NAZIM,
      ASSIGNED_ROLES.MEDARIS_NAZIM,
      SYSTEM_ADMIN_ROLE,
    ]) {
      expect(RUNS_COURSE_ROLES).toContain(role);
      expect(RUNS_MADRASAH_ROLES).toContain(role);
    }
    expect(RUNS_COURSE_ROLES).not.toContain(ASSIGNED_ROLES.MEDRESE_NAZIR);
    expect(RUNS_MADRASAH_ROLES).toContain(ASSIGNED_ROLES.MEDRESE_NAZIR);
    expect(RUNS_MADRASAH_ROLES).toContain(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS);
  });
});
