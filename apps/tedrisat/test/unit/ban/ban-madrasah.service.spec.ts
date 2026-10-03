import type { AuthzService } from "@medaris/common";
import type { BanRepository, IBanEntry } from "../../../src/ban/ban.repository";
import { BanService } from "../../../src/ban/ban.service";
import type { IHeldAssignment } from "../../../src/ban/ban-tier";
import {
  ASSIGNED_ROLES,
  SCOPE_TYPES,
} from "../../../src/database/schema/role-assignment.schema";
import type { KoskService } from "../../../src/kosk/kosk.service";

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
  extendedFromCourseTitle: null,
  permanentRequestedAt: null,
  ...over,
});

const held = (
  role: IHeldAssignment["role"],
  scopeType: IHeldAssignment["scopeType"],
  scopeId: string | null
): IHeldAssignment => ({ role, scopeType, scopeId });

const head = held(
  ASSIGNED_ROLES.MEDRESE_BASMUDERRIS,
  SCOPE_TYPES.MADRASAH,
  MADRASAH
);
const koskNazim = held(ASSIGNED_ROLES.KOSK_NAZIM, SCOPE_TYPES.KOSK, KOSK);

/** The flags `listForMadrasah` gives each of the rows, for a caller who holds `roles`. */
async function flags(
  rows: IBanEntry[],
  roles: IHeldAssignment[],
  { admin = false, widened = [] as string[] } = {}
) {
  const repo = {
    listByMadrasah: vi.fn().mockResolvedValue(rows),
    countsByMadrasah: vi
      .fn()
      .mockResolvedValue({ active: rows.length, lifted: 0, recent: 0 }),
    openMadrasahBanUsers: vi.fn().mockResolvedValue(new Set(widened)),
    rolesOf: vi.fn().mockResolvedValue(roles),
  };
  const service = new BanService(
    repo as unknown as BanRepository,
    {} as KoskService,
    { isSystemAdmin: () => admin } as unknown as AuthzService
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
    const [asMuderris] = await flags(rows, [
      held(ASSIGNED_ROLES.MUDERRIS, SCOPE_TYPES.COURSE, COURSE),
    ]);
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
