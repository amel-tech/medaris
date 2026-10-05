import { type IHeldGrantCodes, PERMISSIONS } from "@medaris/common";
import type { BanRepository, IBanEntry } from "../../../src/ban/ban.repository";
import { BanService } from "../../../src/ban/ban.service";
import {
  BanActiveError,
  BanAlreadyLiftedError,
  BanForbiddenError,
  BanLiftForbiddenError,
  BanNotFoundError,
  BanTargetInvalidError,
} from "../../../src/ban/errors/ban-errors";
import { CourseNotFoundError } from "../../../src/course/errors/course-not-found.error";
import {
  ASSIGNED_ROLES,
  type AssignedRole,
} from "../../../src/database/schema/role-assignment.schema";
import type { KoskService } from "../../../src/kosk/kosk.service";
import type { NotificationService } from "../../../src/notification/notification.service";
import { authorityOf, grantOf, heldRole } from "../../helpers/ban-holdings";

const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const COURSE = "b0000000-0000-4000-8000-0000000000bb";
const TALEBE = "b0000000-0000-4000-8000-0000000000cc";
const BAN_ID = "b0000000-0000-4000-8000-0000000000dd";
const course = { id: COURSE, koskId: KOSK, madrasahId: null, title: "Emsile" };
const where = { koskId: KOSK, courseId: COURSE };
const person = (id: string) => ({ id, name: id, email: null });

const entry = (over: Partial<IBanEntry> = {}): IBanEntry => ({
  id: BAN_ID,
  userId: TALEBE,
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
  user: person(TALEBE),
  bannerPerson: person("m1"),
  lifterPerson: null,
  courseTitle: "Emsile",
  madrasahName: null,
  placeMadrasahId: null,
  extendedFromCourseTitle: null,
  koskName: "Nûruosmaniye Köşkü",
  permanentRequestedAt: null,
  ...over,
});

/**
 * The service for a caller who holds `roles` (each where it is held in this
 * köşk and course) and, optionally, `grants`: the standing is the catalogue's,
 * computed from those, not set by the spec.
 */
function build(
  roles: AssignedRole[],
  repo: Record<string, unknown> = {},
  admin = false,
  grants: IHeldGrantCodes[] = []
) {
  const full = {
    findCourse: vi.fn().mockResolvedValue(course),
    rolesHeld: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ ban: { id: BAN_ID }, created: true }),
    findEntry: vi.fn().mockResolvedValue(entry()),
    findById: vi.fn().mockResolvedValue(entry()),
    lift: vi.fn().mockResolvedValue({ id: BAN_ID }),
    isBarredFromCourse: vi.fn().mockResolvedValue(false),
    nazimRecipients: vi.fn().mockResolvedValue(["n1", "m1"]),
    seatsNewlyBarred: vi.fn().mockResolvedValue([]),
    ...repo,
  };
  const notify = vi.fn().mockResolvedValue(undefined);
  const service = new BanService(
    full as unknown as BanRepository,
    { exists: vi.fn().mockResolvedValue(true) } as unknown as KoskService,
    { notify } as unknown as NotificationService,
    authorityOf(
      roles.map((role) => heldRole(role, where)),
      grants,
      admin
    )
  );
  return { service, repo: full, notify };
}

const dto = { userId: TALEBE, scope: "COURSE", reason: "  Hakaret.  " };

describe("BanService (MDRS-177)", () => {
  describe("create", () => {
    it("bars a talebe for a müderris and trims the reason", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.MUDERRIS]);
      await service.create({ sub: "m1" }, COURSE, dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "Hakaret.",
          bannedTier: 1,
          bannedRole: "MUDERRIS",
          courseId: COURSE,
          extendedFromCourseId: null,
        })
      );
    });

    it("tells the nazımları of a new course ban, but not the one who placed it", async () => {
      const { service, notify } = build([ASSIGNED_ROLES.MUDERRIS]);
      await service.create({ sub: "m1" }, COURSE, dto);
      expect(notify).toHaveBeenCalledTimes(1);
      const sent = notify.mock.calls[0];
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        userId: "n1",
        type: "COURSE_BAN_PLACED",
        targetType: "KOSK",
        targetId: KOSK,
        params: {
          source: "Nûruosmaniye Köşkü",
          courseTitle: "Emsile",
          talebeName: TALEBE,
          actorName: "m1",
          reason: "r",
        },
      });
    });

    it("words a whole-köşk ban as KOSK_BAN_PLACED", async () => {
      const { service, notify } = build([ASSIGNED_ROLES.KOSK_NAZIM], {
        findEntry: vi.fn().mockResolvedValue(entry({ scope: "KOSK" })),
      });
      await service.create({ sub: "m1" }, COURSE, { ...dto, scope: "KOSK" });
      expect(notify.mock.calls[0][0]).toMatchObject({
        type: "KOSK_BAN_PLACED",
      });
    });

    it("tells the talebe their access to the course was removed, never the reason (MDRS-213)", async () => {
      const { service, notify } = build([ASSIGNED_ROLES.MUDERRIS], {
        seatsNewlyBarred: vi.fn().mockResolvedValue([
          {
            userId: TALEBE,
            courseId: COURSE,
            courseTitle: "Emsile",
            koskName: "Nûruosmaniye Köşkü",
          },
        ]),
      });
      await service.create({ sub: "m1" }, COURSE, dto);
      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify.mock.calls[1]).toEqual([
        {
          userId: TALEBE,
          type: "COURSE_ACCESS_REMOVED",
          targetType: "COURSE",
          targetId: COURSE,
          params: { courseTitle: "Emsile", source: "Nûruosmaniye Köşkü" },
        },
      ]);
    });

    it("stays silent for a second request that placed nothing new", async () => {
      const { service, notify } = build([ASSIGNED_ROLES.MUDERRIS], {
        create: vi
          .fn()
          .mockResolvedValue({ ban: { id: BAN_ID }, created: false }),
      });
      await service.create({ sub: "m1" }, COURSE, dto);
      expect(notify).not.toHaveBeenCalled();
    });

    it("keeps the ban when the notification cannot be written", async () => {
      const { service, notify } = build([ASSIGNED_ROLES.MUDERRIS]);
      notify.mockRejectedValue(new Error("db down"));
      await expect(
        service.create({ sub: "m1" }, COURSE, dto)
      ).resolves.toMatchObject({ id: BAN_ID });
    });

    it("refuses an unknown course", async () => {
      const { service } = build([], {
        findCourse: vi.fn().mockResolvedValue(null),
      });
      await expect(service.create({ sub: "m1" }, COURSE, dto)).rejects.toThrow(
        CourseNotFoundError
      );
    });

    it("refuses someone who holds no ban permission, whatever role they hold (MDRS-205)", async () => {
      for (const role of [
        ASSIGNED_ROLES.MEDRESE_NAZIR,
        ASSIGNED_ROLES.DERS_NAZIR,
        ASSIGNED_ROLES.MEDARIS_NAZIM,
      ]) {
        const { service, repo } = build([role]);
        await expect(service.create({ sub: "x" }, COURSE, dto)).rejects.toThrow(
          BanForbiddenError
        );
        expect(repo.create).not.toHaveBeenCalled();
      }
    });

    it("lets a ders nazırı bar once the permission is granted, at the course's tier", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.DERS_NAZIR], {}, false, [
        grantOf([PERMISSIONS.BAN_COURSE], { type: "course", id: COURSE }),
      ]);
      await service.create({ sub: "x" }, COURSE, dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bannedRole: "DERS_NAZIR",
          bannedTier: 1,
        })
      );
    });

    it("keeps the whole-köşk ban for the köşk nazımı and above", async () => {
      const kosk = { ...dto, scope: "KOSK" };
      await expect(
        build([ASSIGNED_ROLES.MUDERRIS]).service.create(
          { sub: "m1" },
          COURSE,
          kosk
        )
      ).rejects.toThrow(BanForbiddenError);
      const { service, repo } = build([ASSIGNED_ROLES.KOSK_NAZIM]);
      await service.create({ sub: "n1" }, COURSE, kosk);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "KOSK",
          courseId: null,
          extendedFromCourseId: COURSE,
          bannedTier: 3,
        })
      );
    });

    it("lets the başnazım ban as SYSTEM_ADMIN at the top tier", async () => {
      const { service, repo } = build([], {}, true);
      await service.create({ sub: "a1" }, COURSE, dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bannedRole: "SYSTEM_ADMIN", bannedTier: 4 })
      );
    });

    it("refuses barring oneself or someone who runs the course", async () => {
      await expect(
        build([ASSIGNED_ROLES.MUDERRIS]).service.create(
          { sub: TALEBE },
          COURSE,
          dto
        )
      ).rejects.toThrow(BanTargetInvalidError);
      const staff = build([ASSIGNED_ROLES.MUDERRIS], {
        rolesHeld: vi.fn().mockResolvedValue([ASSIGNED_ROLES.KOSK_NAZIM]),
      });
      await expect(
        staff.service.create({ sub: "m1" }, COURSE, dto)
      ).rejects.toThrow(BanTargetInvalidError);
      expect(staff.repo.create).not.toHaveBeenCalled();
    });
  });

  describe("lift", () => {
    it("lets the banner's kademe lift", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.MUDERRIS]);
      await service.lift({ sub: "m2" }, BAN_ID, { reason: " Görüşüldü. " });
      expect(repo.lift).toHaveBeenCalledWith(BAN_ID, {
        liftedBy: "m2",
        liftReason: "Görüşüldü.",
        role: "MUDERRIS",
      });
    });

    it("lets a higher kademe lift a lower one's ban", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.KOSK_NAZIM]);
      await service.lift({ sub: "n1" }, BAN_ID, { reason: "ok" });
      expect(repo.lift).toHaveBeenCalled();
    });

    it("refuses a lower kademe", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.MUDERRIS], {
        findById: vi.fn().mockResolvedValue(entry({ bannedTier: 3 })),
      });
      await expect(
        service.lift({ sub: "m2" }, BAN_ID, { reason: "ok" })
      ).rejects.toThrow(BanLiftForbiddenError);
      expect(repo.lift).not.toHaveBeenCalled();
    });

    it("keeps a Medaris nazımı's ban for Medaris administration", async () => {
      const banned = {
        findById: vi.fn().mockResolvedValue(entry({ bannedTier: 4 })),
      };
      await expect(
        build([ASSIGNED_ROLES.KOSK_NAZIM], banned).service.lift(
          { sub: "n1" },
          BAN_ID,
          {
            reason: "ok",
          }
        )
      ).rejects.toThrow(BanLiftForbiddenError);
      const admin = build([], banned, true);
      await admin.service.lift({ sub: "a1" }, BAN_ID, { reason: "ok" });
      expect(admin.repo.lift).toHaveBeenCalled();
    });

    it("answers a missing ban 404 and a lifted one 409", async () => {
      await expect(
        build([], { findById: vi.fn().mockResolvedValue(null) }).service.lift(
          { sub: "a" },
          BAN_ID,
          { reason: "ok" }
        )
      ).rejects.toThrow(BanNotFoundError);
      await expect(
        build([ASSIGNED_ROLES.MUDERRIS], {
          findById: vi
            .fn()
            .mockResolvedValue(entry({ liftedAt: new Date(), liftedBy: "x" })),
        }).service.lift({ sub: "m" }, BAN_ID, { reason: "ok" })
      ).rejects.toThrow(BanAlreadyLiftedError);
    });

    it("answers a lift that lost the race 409", async () => {
      const { service } = build([ASSIGNED_ROLES.MUDERRIS], {
        lift: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.lift({ sub: "m2" }, BAN_ID, { reason: "ok" })
      ).rejects.toThrow(BanAlreadyLiftedError);
    });
  });

  describe("listForKosk", () => {
    const listRepo = (rows: IBanEntry[]) => ({
      listByKosk: vi.fn().mockResolvedValue(rows),
      counts: vi.fn().mockResolvedValue({ active: 9, lifted: 2, recent: 3 }),
    });

    it("is for the köşk nazımı and above", async () => {
      const { service } = build([ASSIGNED_ROLES.MUDERRIS], listRepo([]));
      await expect(
        service.listForKosk({ sub: "m1" }, KOSK, "ACTIVE")
      ).rejects.toThrow(BanForbiddenError);
    });

    it("says per row whether the caller may lift and widen", async () => {
      const rows = [
        entry(),
        entry({ id: "p", bannedTier: 4, userId: "u2" }),
        entry({ id: "k", scope: "KOSK", courseId: null, userId: "u3" }),
      ];
      const { service } = build([ASSIGNED_ROLES.KOSK_NAZIM], listRepo(rows));
      const list = await service.listForKosk({ sub: "n1" }, KOSK, "ACTIVE");
      expect(list.activeCount).toBe(9);
      expect(
        list.items.map((i) => [i.viewerMayLift, i.viewerMayExtend])
      ).toEqual([
        [true, true],
        [false, true],
        [true, false],
      ]);
    });
  });

  describe("listAll (MDRS-178)", () => {
    const filter = { status: "ACTIVE" as const, limit: 50, offset: 0 };
    const allRepo = (rows: IBanEntry[]) => ({
      listAll: vi.fn().mockResolvedValue({ items: rows, total: rows.length }),
      counts: vi.fn().mockResolvedValue({ active: 12, lifted: 3, recent: 3 }),
    });
    /** A Medaris nazımı holds nothing until a grant says so. */
    const medaris = (
      ...codes: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]
    ) => [[ASSIGNED_ROLES.MEDARIS_NAZIM], false, [grantOf(codes)]] as const;

    it("is for Medaris administration only", async () => {
      for (const roles of [
        [ASSIGNED_ROLES.KOSK_NAZIM],
        // A Medaris nazımı with no grant is no longer Medaris administration here.
        [ASSIGNED_ROLES.MEDARIS_NAZIM],
      ]) {
        const { service, repo } = build(roles, allRepo([]));
        await expect(service.listAll({ sub: "n1" }, filter)).rejects.toThrow(
          BanForbiddenError
        );
        expect(repo.listAll).not.toHaveBeenCalled();
      }
    });

    it("reads with platform.ban_scoped or platform.ban_account, and with no other platform permission it does not", async () => {
      for (const code of [
        PERMISSIONS.PLATFORM_BAN_SCOPED,
        PERMISSIONS.PLATFORM_BAN_ACCOUNT,
      ]) {
        const [roles, admin, grants] = medaris(code);
        const { service } = build([...roles], allRepo([]), admin, [...grants]);
        await expect(
          service.listAll({ sub: "m" }, filter)
        ).resolves.toMatchObject({ total: 0 });
      }
      const [roles, admin, grants] = medaris(PERMISSIONS.PLATFORM_KOSK_EDIT);
      const { service } = build([...roles], allRepo([]), admin, [...grants]);
      await expect(service.listAll({ sub: "m" }, filter)).rejects.toThrow(
        BanForbiddenError
      );
    });

    it("lets the başnazım and a Medaris nazımı in, with platform-wide counts", async () => {
      const rows = [entry(), entry({ id: "k", scope: "KOSK", courseId: null })];
      const [roles, nazimAdmin, grants] = medaris(
        PERMISSIONS.PLATFORM_BAN_SCOPED
      );
      const nazim = build([...roles], allRepo(rows), nazimAdmin, [...grants]);
      const list = await nazim.service.listAll({ sub: "m" }, filter);
      expect(nazim.repo.counts).toHaveBeenCalledWith(null, expect.any(Date));
      expect(list).toMatchObject({
        total: 2,
        activeCount: 12,
        liftedCount: 3,
        recentCount: 3,
      });
      const admin = build([], allRepo([]), true);
      await expect(
        admin.service.listAll({ sub: "a" }, filter)
      ).resolves.toMatchObject({ total: 0 });
    });

    it("offers widening only where no köşk ban of that person stands in that köşk", async () => {
      const rows = [
        entry({ id: "a", userId: "u1" }),
        entry({ id: "b", userId: "u2" }),
        entry({ id: "c", userId: "u2", scope: "KOSK", courseId: null }),
        entry({ id: "d", userId: "u1", koskId: "other-kosk" }),
      ];
      const [roles, admin, grants] = medaris(PERMISSIONS.PLATFORM_BAN_SCOPED);
      const { service } = build([...roles], allRepo(rows), admin, [...grants]);
      const list = await service.listAll({ sub: "m" }, filter);
      expect(list.items.map((i) => [i.id, i.viewerMayExtend])).toEqual([
        ["a", true],
        ["b", false],
        ["c", false],
        ["d", true],
      ]);
    });
  });

  describe("extend (MDRS-178)", () => {
    const dto = {
      scope: "KOSK",
      reason: "  Köşkün başka derslerine başvurdu. ",
    };

    it("opens a köşk ban from the course ban for a köşk nazımı", async () => {
      const { service, repo } = build([ASSIGNED_ROLES.KOSK_NAZIM]);
      await service.extend({ sub: "n1" }, BAN_ID, dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "KOSK",
          courseId: null,
          userId: TALEBE,
          extendedFromCourseId: COURSE,
          extendedFromBanId: BAN_ID,
          reason: "Köşkün başka derslerine başvurdu.",
          bannedTier: 3,
        })
      );
    });

    it("refuses a müderris, a stranger, a köşk ban and a lifted ban", async () => {
      const refused = async (
        roles: string[],
        found: IBanEntry,
        error: new (...args: never[]) => Error
      ) => {
        const { service, repo } = build(roles, {
          findById: vi.fn().mockResolvedValue(found),
        });
        await expect(service.extend({ sub: "x" }, BAN_ID, dto)).rejects.toThrow(
          error
        );
        expect(repo.create).not.toHaveBeenCalled();
      };
      await refused([ASSIGNED_ROLES.MUDERRIS], entry(), BanForbiddenError);
      await refused([], entry(), BanForbiddenError);
      await refused(
        [ASSIGNED_ROLES.KOSK_NAZIM],
        entry({ scope: "KOSK", courseId: null }),
        BanTargetInvalidError
      );
      await refused(
        [ASSIGNED_ROLES.KOSK_NAZIM],
        entry({ liftedAt: new Date(), liftedBy: "m" }),
        BanAlreadyLiftedError
      );
    });

    it("answers an unknown ban 404", async () => {
      const { service } = build([], {
        findById: vi.fn().mockResolvedValue(null),
      });
      await expect(service.extend({ sub: "a" }, BAN_ID, dto)).rejects.toThrow(
        BanNotFoundError
      );
    });

    it("lets the başnazım widen as SYSTEM_ADMIN", async () => {
      const { service, repo } = build([], {}, true);
      await service.extend({ sub: "a1" }, BAN_ID, dto);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bannedRole: "SYSTEM_ADMIN", bannedTier: 4 })
      );
    });
  });

  describe("barred", () => {
    it("refuses a barred talebe with BAN_ACTIVE", async () => {
      const { service } = build([], {
        isBarredFromCourse: vi.fn().mockResolvedValue(true),
      });
      await expect(service.assertNotBarred(TALEBE, COURSE)).rejects.toThrow(
        BanActiveError
      );
      await expect(service.isBarred(TALEBE, COURSE)).resolves.toBe(true);
    });

    it("lets everyone else through", async () => {
      const { service } = build([]);
      await expect(
        service.assertNotBarred(TALEBE, COURSE)
      ).resolves.toBeUndefined();
    });
  });
});
