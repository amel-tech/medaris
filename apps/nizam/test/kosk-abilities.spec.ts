import { describe, expect, it } from "vitest";
import {
  koskAbilities,
  koskListEmptyState,
  mayCreateKosk,
  mayEditCourse,
  taughtElsewhere,
} from "~/features/kosks/kosk-abilities";

/**
 * nizam's half of the button table (MDRS-108). The other half,
 * `apps/tedrisat/test/unit/authz/nizam-kosk-buttons.spec.ts`, pins that each
 * role named here holds the scopes behind the button in the matrix; this one
 * pins that nizam shows the button to exactly those roles. Change both
 * together.
 *
 *   button                | shown to
 *   Köşkü Düzenle         | KOSK_MANAGER, MADRASAH_NAZIR
 *   Yeni Ders Aç          | KOSK_MANAGER
 *   Bekleyen talepler     | KOSK_MANAGER
 *   course editor         | KOSK_MANAGER, MUDERRIS (of that course)
 *   Yeni Köşk             | SYSTEM_ADMIN only
 *
 * SYSTEM_ADMIN sees every button; tedrisat's realm bypass answers it.
 */
const KOSK = "a0000000-0000-4000-8000-000000000001";
const OTHER_KOSK = "a0000000-0000-4000-8000-000000000002";
const MEDRESE = "b0000000-0000-4000-8000-000000000001";
const COURSE = "c0000000-0000-4000-8000-000000000001";
const OTHER_COURSE = "c0000000-0000-4000-8000-000000000002";

type Me = Parameters<typeof koskAbilities>[0];
const me = (roles: Partial<NonNullable<Me>["roles"]> = {}): Me => ({
  roles: {
    systemAdmin: false,
    nazirOf: [],
    manages: [],
    teaches: [],
    ...roles,
  },
});

const standalone = { id: KOSK, madrasah: null };
const inMedrese = {
  id: KOSK,
  madrasah: { id: MEDRESE, name: "Medrese", handle: "medrese" },
};

/** One caller for each role `/me` can express towards KOSK and COURSE. */
const ROLES = {
  KOSK_MANAGER: me({ manages: [{ id: KOSK, name: "Köşk" }] }),
  MADRASAH_NAZIR: me({ nazirOf: [{ id: MEDRESE, name: "Medrese" }] }),
  MUDERRIS: me({ teaches: [{ id: COURSE, title: "Ders", koskId: KOSK }] }),
  // Signed in, no role here: what the matrix calls PUBLIC.
  PUBLIC: me({
    manages: [{ id: OTHER_KOSK, name: "Başka" }],
    teaches: [{ id: OTHER_COURSE, title: "Başka", koskId: OTHER_KOSK }],
  }),
  SYSTEM_ADMIN: me({ systemAdmin: true }),
} as const;
type RoleName = keyof typeof ROLES;

const shownTo = (show: (caller: Me) => boolean): RoleName[] =>
  (Object.keys(ROLES) as RoleName[]).filter((role) => show(ROLES[role]));

describe("koskAbilities (MDRS-108)", () => {
  it("shows Köşkü Düzenle to the manager and the medrese's nazır", () => {
    expect(shownTo((c) => koskAbilities(c, inMedrese).edit)).toEqual([
      "KOSK_MANAGER",
      "MADRASAH_NAZIR",
      "SYSTEM_ADMIN",
    ]);
  });

  it("does not make a nazır of some medrese a nazır of a standalone köşk", () => {
    expect(shownTo((c) => koskAbilities(c, standalone).edit)).toEqual([
      "KOSK_MANAGER",
      "SYSTEM_ADMIN",
    ]);
  });

  it("shows Yeni Ders Aç and Bekleyen talepler to the manager alone", () => {
    for (const kosk of [standalone, inMedrese]) {
      expect(shownTo((c) => koskAbilities(c, kosk).openCourse)).toEqual([
        "KOSK_MANAGER",
        "SYSTEM_ADMIN",
      ]);
      expect(shownTo((c) => koskAbilities(c, kosk).reviewRequests)).toEqual([
        "KOSK_MANAGER",
        "SYSTEM_ADMIN",
      ]);
    }
  });

  it("shows nothing when /me could not be read", () => {
    expect(koskAbilities(null, inMedrese)).toEqual({
      edit: false,
      openCourse: false,
      reviewRequests: false,
    });
  });
});

describe("mayEditCourse (MDRS-108)", () => {
  it("links a course card for the manager and that course's müderris", () => {
    expect(shownTo((c) => mayEditCourse(c, KOSK, COURSE))).toEqual([
      "KOSK_MANAGER",
      "MUDERRIS",
      "SYSTEM_ADMIN",
    ]);
  });

  it("does not link another course of the same köşk for that müderris", () => {
    expect(mayEditCourse(ROLES.MUDERRIS, KOSK, OTHER_COURSE)).toBe(false);
    expect(mayEditCourse(null, KOSK, COURSE)).toBe(false);
  });
});

describe("taughtElsewhere", () => {
  it("lists the courses taught in köşks the caller does not manage", () => {
    const course = { id: COURSE, title: "Ders", koskId: KOSK };
    expect(taughtElsewhere(me({ teaches: [course] }))).toEqual([course]);
    expect(
      taughtElsewhere(
        me({ teaches: [course], manages: [{ id: KOSK, name: "Köşk" }] })
      )
    ).toEqual([]);
    expect(taughtElsewhere(null)).toEqual([]);
  });
});

describe("koskListEmptyState", () => {
  it("never sends a köşk manager to nazir", () => {
    expect(
      koskListEmptyState(
        me({
          manages: [{ id: KOSK, name: "Köşk" }],
          nazirOf: [{ id: MEDRESE, name: "Medrese" }],
        })
      )
    ).toBe("none");
  });

  it("points a nazır with no köşk of their own at nazir", () => {
    expect(koskListEmptyState(ROLES.MADRASAH_NAZIR)).toBe("nazir");
  });

  it("is the plain empty state for everyone else", () => {
    expect(koskListEmptyState(me())).toBe("none");
    expect(koskListEmptyState(ROLES.MUDERRIS)).toBe("none");
    expect(koskListEmptyState(null)).toBe("none");
  });
});

describe("mayCreateKosk", () => {
  it("shows Yeni Köşk to SYSTEM_ADMIN alone, as POST /kosks allows", () => {
    expect(shownTo(mayCreateKosk)).toEqual(["SYSTEM_ADMIN"]);
  });

  it("shows nothing when /me could not be read", () => {
    expect(mayCreateKosk(null)).toBe(false);
  });
});
