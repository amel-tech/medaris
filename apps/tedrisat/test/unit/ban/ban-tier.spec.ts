import {
  BAN_TIERS,
  highestRole,
  MAY_BAN_ROLES,
  mayBanKosk,
  mayLift,
  SYSTEM_ADMIN_ROLE,
  tierOfRole,
} from "../../../src/ban/ban-tier";
import { ASSIGNED_ROLES } from "../../../src/database/schema/role-assignment.schema";

describe("ban tiers (MDRS-177)", () => {
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

  it("keeps a medrese nazır out of the roles that may ban in a köşk", () => {
    expect(MAY_BAN_ROLES).not.toContain(ASSIGNED_ROLES.MEDRESE_NAZIR);
    expect(MAY_BAN_ROLES).toContain(ASSIGNED_ROLES.MUDERRIS);
  });

  it("allows banning a whole köşk from the köşk nazımı up", () => {
    expect(mayBanKosk(BAN_TIERS.COURSE)).toBe(false);
    expect(mayBanKosk(BAN_TIERS.KOSK)).toBe(true);
    expect(mayBanKosk(BAN_TIERS.PLATFORM)).toBe(true);
  });
});
