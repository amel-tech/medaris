import {
  BAN_TIERS,
  highestRole,
  type IHeldAssignment,
  MADRASAH_WIDE_ROLES,
  MAY_BAN_ROLES,
  MAY_MODERATE_ROLES,
  mayBanKosk,
  mayLift,
  SYSTEM_ADMIN_ROLE,
  standingAmong,
  tierOfRole,
} from "../../../src/ban/ban-tier";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../../../src/database/schema/role-assignment.schema";

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

  it("lets the medrese's own roles act on a ban beside those who ban (MDRS-187)", () => {
    for (const role of MAY_BAN_ROLES) {
      expect(MAY_MODERATE_ROLES).toContain(role);
    }
    expect(MAY_MODERATE_ROLES).toContain(ASSIGNED_ROLES.MEDRESE_NAZIR);
    expect(MAY_MODERATE_ROLES).toContain(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS);
  });

  it("keeps acting for the whole medrese to its nazırs and Medaris administration", () => {
    expect([...MADRASAH_WIDE_ROLES].sort()).toEqual(
      [
        ASSIGNED_ROLES.MEDRESE_NAZIR,
        ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
        ASSIGNED_ROLES.MEDARIS_NAZIM,
        SYSTEM_ADMIN_ROLE,
      ].sort()
    );
  });

  describe("standingAmong", () => {
    const held = (
      role: IHeldAssignment["role"],
      scopeType: IHeldAssignment["scopeType"],
      scopeId: string | null
    ): IHeldAssignment => ({ role, scopeType, scopeId });
    const here = { koskId: "k1", courseId: "c1", madrasahId: "m1" };

    it("counts a role held platform-wide, or in the köşk, the course or the medrese where the ban sits", () => {
      const among = (h: IHeldAssignment) =>
        standingAmong([h], here, MAY_MODERATE_ROLES);
      expect(
        among(held(ASSIGNED_ROLES.MEDARIS_NAZIM, SCOPE_TYPES.PLATFORM, null))
      ).toBe(ASSIGNED_ROLES.MEDARIS_NAZIM);
      expect(
        among(held(ASSIGNED_ROLES.KOSK_NAZIM, SCOPE_TYPES.KOSK, "k1"))
      ).toBe(ASSIGNED_ROLES.KOSK_NAZIM);
      expect(
        among(held(ASSIGNED_ROLES.MUDERRIS, SCOPE_TYPES.COURSE, "c1"))
      ).toBe(ASSIGNED_ROLES.MUDERRIS);
      expect(
        among(held(ASSIGNED_ROLES.MEDRESE_NAZIR, SCOPE_TYPES.MADRASAH, "m1"))
      ).toBe(ASSIGNED_ROLES.MEDRESE_NAZIR);
    });

    it("ignores a role held somewhere else, and one that may not act", () => {
      expect(
        standingAmong(
          [
            held(ASSIGNED_ROLES.KOSK_NAZIM, SCOPE_TYPES.KOSK, "k2"),
            held(ASSIGNED_ROLES.MUDERRIS, SCOPE_TYPES.COURSE, "c2"),
            held(ASSIGNED_ROLES.MEDRESE_NAZIR, SCOPE_TYPES.MADRASAH, "m2"),
          ],
          here,
          MAY_MODERATE_ROLES
        )
      ).toBeNull();
      // A medrese-less köşk course has no medrese for a medrese role to bear on.
      expect(
        standingAmong(
          [held(ASSIGNED_ROLES.MEDRESE_NAZIR, SCOPE_TYPES.MADRASAH, "m1")],
          { koskId: "k1", courseId: "c1", madrasahId: null },
          MAY_MODERATE_ROLES
        )
      ).toBeNull();
      expect(
        standingAmong(
          [held(ASSIGNED_ROLES.KOSK_NAZIM, SCOPE_TYPES.KOSK, "k1")],
          here,
          MADRASAH_WIDE_ROLES
        )
      ).toBeNull();
    });

    it("takes the highest of those that bear", () => {
      expect(
        standingAmong(
          [
            held(ASSIGNED_ROLES.MUDERRIS, SCOPE_TYPES.COURSE, "c1"),
            held(
              ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
              SCOPE_TYPES.MADRASAH,
              "m1"
            ),
            held(ASSIGNED_ROLES.KOSK_NAZIM, SCOPE_TYPES.KOSK, "k1"),
          ],
          here,
          MAY_MODERATE_ROLES
        )
      ).toBe(ASSIGNED_ROLES.KOSK_NAZIM);
    });
  });
});
