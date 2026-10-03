import {
  type IHeldGrantCodes,
  type IHeldRole,
  PERMISSIONS,
  SCOPE_TYPES,
} from "@medaris/common";
import type { BanRepository, IBanEntry } from "../../../src/ban/ban.repository";
import { BanService } from "../../../src/ban/ban.service";
import { ASSIGNED_ROLES } from "../../../src/database/schema/role-assignment.schema";
import type { KoskService } from "../../../src/kosk/kosk.service";
import type { NotificationService } from "../../../src/notification/notification.service";
import { authorityOf, grantOf, heldRole } from "../../helpers/ban-holdings";

const MADRASAH = "b1000000-0000-4000-8000-0000000000aa";
const KOSK = "b1000000-0000-4000-8000-0000000000bb";
const COURSE = "b1000000-0000-4000-8000-0000000000cc";
const person = (id: string) => ({ id, name: id, email: null });

const entry = (over: Partial<IBanEntry> = {}): IBanEntry => ({
  id: "ban",
  userId: "talebe",
  koskId: KOSK,
  madrasahId: null,
  courseId: COURSE,
  scope: "COURSE",
  extendedFromCourseId: null,
  reason: "r",
  bannedBy: "m1",
  bannedRole: "MUDERRIS",
  bannedTier: 1,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  liftedAt: null,
  liftedBy: null,
  liftReason: null,
  user: person("talebe"),
  bannerPerson: person("m1"),
  lifterPerson: null,
  courseTitle: "Emsile",
  madrasahName: "Süleymaniye Medresesi",
  placeMadrasahId: MADRASAH,
  extendedFromCourseTitle: null,
  permanentRequestedAt: null,
  ...over,
});

const where = { koskId: KOSK, courseId: COURSE, madrasahId: MADRASAH };
const as = (role: IHeldRole["role"]) => heldRole(role, where);

const head = as(ASSIGNED_ROLES.MEDRESE_BASMUDERRIS);
const koskNazim = as(ASSIGNED_ROLES.KOSK_NAZIM);

/** The flags `listForMadrasah` gives each of the rows, for a caller who holds `roles` and `grants`. */
async function flags(
  rows: IBanEntry[],
  roles: IHeldRole[],
  {
    admin = false,
    widened = [] as string[],
    grants = [] as IHeldGrantCodes[],
  } = {}
) {
  const repo = {
    listByMadrasah: vi.fn().mockResolvedValue(rows),
    countsByMadrasah: vi
      .fn()
      .mockResolvedValue({ active: rows.length, lifted: 0, recent: 0 }),
    openMadrasahBanUsers: vi.fn().mockResolvedValue(new Set(widened)),
  };
  const service = new BanService(
    repo as unknown as BanRepository,
    {} as KoskService,
    {} as NotificationService,
    authorityOf(roles, grants, admin)
  );
  const list = await service.listForMadrasah({ sub: "viewer" }, MADRASAH, {
    status: "ACTIVE",
  });
  return list.items.map((i) => [
    i.viewerMayLift,
    i.viewerMayEscalate,
    i.viewerMayRequestPermanent,
  ]);
}

describe("BanService.listForMadrasah (MDRS-187)", () => {
  const rows = [
    entry({ id: "course" }),
    entry({
      id: "kosk",
      userId: "u2",
      bannedRole: "KOSK_NAZIM",
      bannedTier: 3,
    }),
    entry({
      id: "platform",
      userId: "u3",
      bannedRole: "SYSTEM_ADMIN",
      bannedTier: 4,
    }),
    entry({
      id: "wide",
      userId: "u4",
      scope: "MADRASAH",
      koskId: null,
      madrasahId: MADRASAH,
      courseId: null,
      bannedRole: "MEDRESE_BASMUDERRIS",
      bannedTier: 2,
    }),
  ];

  it("gives the medrese's head the medrese's kademe over each row", async () => {
    expect(await flags(rows, [head])).toEqual([
      [true, true, true],
      [false, true, true],
      [false, true, false],
      [true, false, true],
    ]);
  });

  it("lets a köşk nazım who also heads the medrese lift what the köşk placed, in that köşk only", async () => {
    const elsewhere = rows.map((r) =>
      r.koskId ? entry({ ...r, koskId: "another-kosk" }) : r
    );
    expect(
      (await flags(rows, [head, koskNazim])).map(([lift]) => lift)
    ).toEqual([true, true, false, true]);
    expect(
      (await flags(elsewhere, [head, koskNazim])).map(([lift]) => lift)
    ).toEqual([true, false, false, true]);
  });

  it("gives a köşk nazım or a müderris alone no say over the medrese as a whole", async () => {
    const [course] = await flags(rows, [koskNazim]);
    expect(course).toEqual([true, false, false]);
    const [asMuderris] = await flags(rows, [as(ASSIGNED_ROLES.MUDERRIS)]);
    expect(asMuderris).toEqual([true, false, false]);
  });

  it("gives the başnazım every kademe, but no request for a ban that is Medaris administration's", async () => {
    expect(await flags(rows, [], { admin: true })).toEqual([
      [true, true, true],
      [true, true, true],
      [true, true, false],
      [true, false, true],
    ]);
  });

  it("offers no widening to the person the medrese already bars, nor a second request, nor anything on a lifted ban", async () => {
    const asked = entry({
      id: "asked",
      userId: "u5",
      permanentRequestedAt: new Date("2026-10-02T10:00:00Z"),
    });
    const lifted = entry({
      id: "lifted",
      userId: "u6",
      liftedAt: new Date("2026-10-02T10:00:00Z"),
      liftedBy: "m1",
    });
    expect(
      await flags([entry(), asked, lifted], [head], { widened: ["talebe"] })
    ).toEqual([
      [true, false, true],
      [true, true, false],
      [false, false, false],
    ]);
  });
});

describe("BanService.listForMadrasah from the catalogue (MDRS-205)", () => {
  const rows = [
    entry({ id: "course" }),
    entry({
      id: "wide",
      userId: "u4",
      scope: "MADRASAH",
      koskId: null,
      madrasahId: MADRASAH,
      courseId: null,
      bannedRole: "MEDRESE_BASMUDERRIS",
      bannedTier: 2,
    }),
  ];
  const nazir = as(ASSIGNED_ROLES.MEDRESE_NAZIR);
  const medarisNazim = as(ASSIGNED_ROLES.MEDARIS_NAZIM);
  const at = { type: SCOPE_TYPES.MADRASAH, id: MADRASAH } as const;

  it("gives a medrese nazırı with no grant nothing, though its role reaches the medrese", async () => {
    expect(await flags(rows, [nazir])).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });

  it("lets madrasah.ban lift and widen at the medrese's level, but not lift a course ban, and ask for nothing permanent", async () => {
    expect(
      await flags(rows, [nazir], {
        grants: [grantOf([PERMISSIONS.MADRASAH_BAN], at)],
      })
    ).toEqual([
      [false, true, false],
      [true, false, false],
    ]);
  });

  it("lets madrasah.permanent_ban_request ask on its own, and ban.course lift a course ban", async () => {
    expect(
      await flags(rows, [nazir], {
        grants: [
          grantOf(
            [
              PERMISSIONS.MADRASAH_PERMANENT_BAN_REQUEST,
              PERMISSIONS.BAN_COURSE,
            ],
            at
          ),
        ],
      })
    ).toEqual([
      [true, false, true],
      [false, false, true],
    ]);
  });

  it("lets a Medaris nazımı with platform.ban_scoped lift and widen at the medrese's level, never lift a course ban", async () => {
    expect(
      await flags(rows, [medarisNazim], {
        grants: [grantOf([PERMISSIONS.PLATFORM_BAN_SCOPED])],
      })
    ).toEqual([
      [false, true, false],
      [true, false, false],
    ]);
    // With no grant it holds nothing at all.
    expect(await flags(rows, [medarisNazim])).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });

  it("does not raise a müderris to the nazır's tier because the same person is a medrese nazırı too", async () => {
    // The nazırı confers nothing; only the müderris does, at tier 1, so a ban the
    // medrese's level placed (tier 2) stays out of reach.
    const placedByHead = entry({ id: "by-head", bannedTier: 2 });
    expect(
      await flags([placedByHead], [nazir, as(ASSIGNED_ROLES.MUDERRIS)])
    ).toEqual([[false, false, false]]);
  });
});
