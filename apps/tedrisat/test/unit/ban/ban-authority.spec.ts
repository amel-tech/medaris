import {
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSIONS,
  SCOPE_TYPES,
} from "@medaris/common";
import {
  coursePlace,
  type IBanPlace,
  koskPlace,
  madrasahPlace,
  PLATFORM_PLACE,
  placeOfBan,
} from "../../../src/ban/ban-authority";
import {
  IMPOSE_CODES,
  LIFT_CODES,
  PERMANENT_REQUEST_CODES,
  READ_ALL_BANS_CODES,
  READ_KOSK_BANS_CODES,
} from "../../../src/ban/ban-codes";
import { ASSIGNED_ROLES } from "../../../src/database/schema/role-assignment.schema";
import { authorityOf, grantOf, heldRole } from "../../helpers/ban-holdings";

/**
 * MDRS-205, "bans are decided from the permission catalogue": every ban action
 * against every actor, with and without the grant, as a table. The owner's
 * three answers are the rows that matter: a başmüderris bans in its medrese's
 * courses; the permission to ban at a level also lifts at that level; a Medaris
 * nazımı with only `platform.ban_scoped` bans at the köşk's and the medrese's
 * level and not in a course, while the başnazım may anywhere.
 */
const KOSK = "a1000000-0000-4000-8000-0000000000aa";
const MADRASAH = "a1000000-0000-4000-8000-0000000000bb";
const COURSE = "a1000000-0000-4000-8000-0000000000cc";
const where = { koskId: KOSK, courseId: COURSE, madrasahId: MADRASAH };

const kosksCourse: IBanPlace = coursePlace({
  id: COURSE,
  koskId: KOSK,
  madrasahId: null,
});
const medreseCourse: IBanPlace = coursePlace({
  id: COURSE,
  koskId: KOSK,
  madrasahId: MADRASAH,
});

const R = ASSIGNED_ROLES;
const P = PERMISSIONS;
const role = (r: IHeldRole["role"]) => heldRole(r, where);
const atMadrasah = { type: SCOPE_TYPES.MADRASAH, id: MADRASAH } as const;
const atCourse = { type: SCOPE_TYPES.COURSE, id: COURSE } as const;

interface IActor {
  name: string;
  roles: IHeldRole[];
  grants?: IHeldGrantCodes[];
  admin?: boolean;
}

/** The actions, each as the place it is asked at and the codes it takes. */
const ACTIONS = {
  "impose a course ban (köşk's own course)": [kosksCourse, IMPOSE_CODES.COURSE],
  "impose a course ban (medrese course)": [medreseCourse, IMPOSE_CODES.COURSE],
  "impose a köşk ban": [koskPlace(KOSK), IMPOSE_CODES.KOSK],
  "impose a medrese ban": [madrasahPlace(MADRASAH), IMPOSE_CODES.MADRASAH],
  "lift a course ban (medrese course)": [medreseCourse, LIFT_CODES.COURSE],
  "lift a köşk ban": [koskPlace(KOSK), LIFT_CODES.KOSK],
  "lift a medrese ban": [madrasahPlace(MADRASAH), LIFT_CODES.MADRASAH],
  "ask for a permanent ban": [madrasahPlace(MADRASAH), PERMANENT_REQUEST_CODES],
  "read a köşk's bans": [koskPlace(KOSK), READ_KOSK_BANS_CODES],
  "read every ban": [PLATFORM_PLACE, READ_ALL_BANS_CODES],
} as const;
type Action = keyof typeof ACTIONS;

const may = async (actor: IActor, action: Action) => {
  const [place, codes] = ACTIONS[action];
  const authority = authorityOf(actor.roles, actor.grants, actor.admin);
  const held = await authority.holdingsOf({
    sub: "u",
    realm_access: { roles: actor.admin ? ["SYSTEM_ADMIN"] : [] },
  });
  return authority.standing(held, place, codes) !== null;
};

const allowed = (actor: IActor) =>
  Promise.all(
    (Object.keys(ACTIONS) as Action[]).map(
      async (action) => [action, await may(actor, action)] as const
    )
  ).then((rows) => rows.filter(([, ok]) => ok).map(([action]) => action));

describe("who may do what about bans (MDRS-205)", () => {
  const none: Action[] = [];

  it.each<[IActor, Action[]]>([
    // The roles that hold nothing without a grant.
    [
      { name: "Medaris nazımı, no grant", roles: [role(R.MEDARIS_NAZIM)] },
      none,
    ],
    [
      { name: "medrese nazırı, no grant", roles: [role(R.MEDRESE_NAZIR)] },
      none,
    ],
    [{ name: "ders nazırı, no grant", roles: [role(R.DERS_NAZIR)] }, none],
    [{ name: "no role at all", roles: [] }, none],
  ])("%s may do nothing", async (actor, expected) => {
    expect(await allowed(actor)).toEqual(expected);
  });

  it("a müderris bans and lifts in its course, and reaches nothing wider", async () => {
    expect(await allowed({ name: "m", roles: [role(R.MUDERRIS)] })).toEqual([
      "impose a course ban (köşk's own course)",
      "impose a course ban (medrese course)",
      "lift a course ban (medrese course)",
    ]);
  });

  it("a başmüderris bans in its medrese's courses (the owner's first answer), and at the medrese's level", async () => {
    expect(
      await allowed({ name: "h", roles: [role(R.MEDRESE_BASMUDERRIS)] })
    ).toEqual([
      "impose a course ban (medrese course)",
      "impose a medrese ban",
      "lift a course ban (medrese course)",
      "lift a medrese ban",
      "ask for a permanent ban",
    ]);
  });

  it("a köşk nazımı bans at the course's and the köşk's level, and reads its köşk", async () => {
    expect(await allowed({ name: "k", roles: [role(R.KOSK_NAZIM)] })).toEqual([
      "impose a course ban (köşk's own course)",
      "impose a course ban (medrese course)",
      "impose a köşk ban",
      "lift a course ban (medrese course)",
      "lift a köşk ban",
      "read a köşk's bans",
    ]);
  });

  it("the permission to ban at a level also lifts at that level, each way (the owner's second answer)", async () => {
    const withGrant = (
      r: IHeldRole,
      codes: Parameters<typeof grantOf>[0],
      scope?: Parameters<typeof grantOf>[1]
    ): IActor => ({
      name: "g",
      roles: [r],
      grants: [grantOf(codes, scope)],
    });
    expect(
      await allowed(withGrant(role(R.DERS_NAZIR), [P.BAN_COURSE], atCourse))
    ).toEqual([
      "impose a course ban (köşk's own course)",
      "impose a course ban (medrese course)",
      "lift a course ban (medrese course)",
    ]);
    expect(
      await allowed(
        withGrant(role(R.MEDRESE_NAZIR), [P.MADRASAH_BAN], atMadrasah)
      )
    ).toEqual(["impose a medrese ban", "lift a medrese ban"]);
    expect(
      await allowed(withGrant(role(R.MEDARIS_NAZIM), [P.PLATFORM_BAN_SCOPED]))
    ).toEqual([
      "impose a köşk ban",
      "impose a medrese ban",
      "lift a köşk ban",
      "lift a medrese ban",
      "read a köşk's bans",
      "read every ban",
    ]);
  });

  it("a Medaris nazımı with only platform.ban_scoped neither imposes nor lifts a course ban (the owner's third answer)", async () => {
    const nazim: IActor = {
      name: "n",
      roles: [role(R.MEDARIS_NAZIM)],
      grants: [grantOf([P.PLATFORM_BAN_SCOPED])],
    };
    expect(await may(nazim, "impose a course ban (medrese course)")).toBe(
      false
    );
    expect(await may(nazim, "impose a course ban (köşk's own course)")).toBe(
      false
    );
    expect(await may(nazim, "lift a course ban (medrese course)")).toBe(false);
    // The başnazım may.
    const chief: IActor = { name: "b", roles: [], admin: true };
    expect(await may(chief, "impose a course ban (medrese course)")).toBe(true);
    expect(await may(chief, "lift a course ban (medrese course)")).toBe(true);
  });

  it("ban.lift_course lifts a course ban without placing one, and platform.ban_account only reads", async () => {
    expect(
      await allowed({
        name: "l",
        roles: [role(R.DERS_NAZIR)],
        grants: [grantOf([P.BAN_LIFT_COURSE], atCourse)],
      })
    ).toEqual(["lift a course ban (medrese course)"]);
    expect(
      await allowed({
        name: "a",
        roles: [role(R.MEDARIS_NAZIM)],
        grants: [grantOf([P.PLATFORM_BAN_ACCOUNT])],
      })
    ).toEqual(["read a köşk's bans", "read every ban"]);
  });

  it("a Medaris nazımı given ban.course for a course holds it there, as the catalogue says", async () => {
    expect(
      await allowed({
        name: "c",
        roles: [role(R.MEDARIS_NAZIM)],
        grants: [grantOf([P.BAN_COURSE], atCourse)],
      })
    ).toEqual([
      "impose a course ban (köşk's own course)",
      "impose a course ban (medrese course)",
      "lift a course ban (medrese course)",
    ]);
  });

  it("the başnazım may do all of it", async () => {
    expect((await allowed({ name: "b", roles: [], admin: true })).length).toBe(
      Object.keys(ACTIONS).length
    );
  });

  it("a grant counts only under a role that covers it, and an expired role confers nothing", async () => {
    const ended = new Date(Date.now() - 1000);
    expect(
      await allowed({
        name: "x",
        roles: [{ ...role(R.MUDERRIS), expiresAt: ended }],
      })
    ).toEqual([]);
    // A grant of a medrese's code with no role in that medrese beneath it is nothing.
    expect(
      await allowed({
        name: "y",
        roles: [heldRole(R.MEDRESE_NAZIR, { madrasahId: "another-medrese" })],
        grants: [grantOf([P.MADRASAH_BAN], atMadrasah)],
      })
    ).toEqual([]);
  });

  it("orders by the highest role that confers the permission, not by the highest role held", () => {
    const authority = authorityOf([role(R.MEDRESE_NAZIR), role(R.MUDERRIS)]);
    const held = {
      admin: false,
      roles: [role(R.MEDRESE_NAZIR), role(R.MUDERRIS)],
      grants: [],
    };
    expect(
      authority.standing(held, medreseCourse, IMPOSE_CODES.COURSE)
    ).toEqual({
      role: R.MUDERRIS,
      tier: 1,
    });
    const heldKosk = {
      admin: false,
      roles: [role(R.MUDERRIS), role(R.KOSK_NAZIM)],
      grants: [],
    };
    expect(
      authority.standing(heldKosk, medreseCourse, IMPOSE_CODES.COURSE)
    ).toEqual({ role: R.KOSK_NAZIM, tier: 3 });
  });

  it("finds where an existing ban sits, by its scope", () => {
    expect(
      placeOfBan({ scope: "COURSE", koskId: KOSK, courseId: COURSE }, MADRASAH)
    ).toEqual(medreseCourse);
    expect(
      placeOfBan({ scope: "KOSK", koskId: KOSK, courseId: null }, null)
    ).toEqual(koskPlace(KOSK));
    expect(
      placeOfBan({ scope: "MADRASAH", koskId: null, courseId: null }, MADRASAH)
    ).toEqual(madrasahPlace(MADRASAH));
    expect(
      placeOfBan({ scope: "MADRASAH", koskId: null, courseId: null }, null)
    ).toBeNull();
  });
});
