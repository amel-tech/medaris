import {
  type AuthenticatedUser,
  type AuthzService,
  PERMISSIONS,
  type PermissionCode,
} from "@medaris/common";
import type { ArchiveRepository } from "../../../src/archive/archive.repository";
import { ArchiveService } from "../../../src/archive/archive.service";
import type { IArchiveItem } from "../../../src/archive/archive-types";
import {
  ArchiveForbiddenError,
  ArchiveItemNotFoundError,
  ArchiveParentHiddenError,
  ArchiveRestoreLevelError,
} from "../../../src/archive/errors/archive-errors";
import type { HideLevel } from "../../../src/archive/hide-level";

const P = PERMISSIONS;

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const NAZIM = { sub: "a2" };
const HEAD = { sub: "a3" };
const MUDERRIS = { sub: "a4" };
const MEDARIS = { sub: "a5" };
const STRANGER = { sub: "a6" };
const MEDARIS_MADRASAH = { sub: "a7" };
const MADRASAH = "b0000000-0000-4000-8000-0000000000cc";
const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const ID = "b0000000-0000-4000-8000-0000000000bb";

/**
 * What each person holds on the item's resource, as the engine would answer:
 * a köşk nazımı holds the köşk's codes and, by nesting, the course work; a
 * başmüderris the medrese's codes and the course work; a müderris the course
 * work only; Medaris yönetimi the platform code it was given.
 */
const HOLDS: Record<string, readonly PermissionCode[]> = {
  a2: [P.KOSK_MANAGE, P.COURSE_HIDE, P.WEEK_HIDE, P.SESSION_MANAGE],
  a3: [P.MADRASAH_COURSE_HIDE, P.MADRASAH_HIDE, P.WEEK_HIDE, P.SESSION_MANAGE],
  a4: [P.WEEK_HIDE, P.SESSION_MANAGE],
  a5: [P.PLATFORM_KOSK_EDIT],
  a7: [P.PLATFORM_MADRASAH_EDIT],
};

const item = (over: Partial<IArchiveItem> = {}): IArchiveItem => ({
  type: "course",
  id: ID,
  title: "Maksûd okumaları",
  koskId: KOSK,
  koskName: null,
  madrasahId: null,
  madrasahName: null,
  courseId: ID,
  courseTitle: null,
  weekNumber: null,
  scheduledAt: null,
  weekCount: null,
  sessionCount: null,
  studentCount: null,
  archivedAt: new Date("2026-10-01T10:00:00Z"),
  archivedBy: "a2",
  archivedLevel: null,
  ...over,
});

function serviceWith(
  repo: Partial<Record<keyof ArchiveRepository, unknown>>,
  assertOpen: () => Promise<void> = async () => undefined
) {
  const effective = vi.fn(async (user: AuthenticatedUser) => {
    const codes = HOLDS[user.sub];
    return codes ? { codes: new Set(codes), openedPassive: null } : null;
  });
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
    effective,
    assertOpen: vi.fn(assertOpen),
  } as unknown as AuthzService;
  return {
    service: new ArchiveService(repo as unknown as ArchiveRepository, authz),
    effective,
    assertOpen: authz.assertOpen as ReturnType<typeof vi.fn>,
  };
}

describe("ArchiveService (MDRS-173)", () => {
  describe("the platform archive", () => {
    it("is the başnazım's alone", async () => {
      const { service } = serviceWith({});
      await expect(
        service.listForPlatform(NAZIM, { page: 1, limit: 10 })
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);
      await expect(service.scopes(NAZIM)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      await expect(service.impact(NAZIM, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      await expect(service.delete(NAZIM, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
    });

    it("pages with the offset a page number implies and attaches the hider", async () => {
      const list = vi.fn().mockResolvedValue([item()]);
      const { service } = serviceWith({
        list,
        count: vi.fn().mockResolvedValue(18),
        archivers: vi
          .fn()
          .mockResolvedValue(
            new Map([
              [
                `course:${ID}`,
                { id: "a2", name: "Abdülhamit", role: "KOSK_NAZIM" },
              ],
            ])
          ),
      });
      const page = await service.listForPlatform(ADMIN, { page: 2, limit: 10 });
      expect(list).toHaveBeenCalledWith({}, 10, 10);
      expect(page).toMatchObject({ total: 18, page: 2, limit: 10 });
      expect(page.items[0].archiver).toEqual({
        id: "a2",
        name: "Abdülhamit",
        role: "KOSK_NAZIM",
      });
    });
  });

  describe("a köşk's archive", () => {
    const page = (rows: IArchiveItem[]) => ({
      koskExists: vi.fn().mockResolvedValue(true),
      list: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      archivers: vi.fn().mockResolvedValue(new Map()),
    });

    it("lists a köşk's contents only, never the köşk or a medrese", async () => {
      const repo = page([]);
      const { service } = serviceWith(repo);
      await service.listForKosk(NAZIM, KOSK, { page: 1, limit: 10 });
      expect(repo.list.mock.calls[0][0]).toMatchObject({
        koskId: KOSK,
        types: ["course", "week", "session", "recording", "deck"],
      });
    });

    it("says what the caller may bring back: what the köşk hid, not what the platform did", async () => {
      const { service } = serviceWith(
        page([
          item({ id: "c-kosk", archivedLevel: "kosk" }),
          item({ id: "c-platform", archivedLevel: "platform" }),
        ])
      );
      const asNazim = await service.listForKosk(NAZIM, KOSK, {
        page: 1,
        limit: 10,
      });
      expect(asNazim.items.map((i) => i.canRestore)).toEqual([true, false]);
      const asAdmin = await service.listForKosk(ADMIN, KOSK, {
        page: 1,
        limit: 10,
      });
      expect(asAdmin.items.map((i) => i.canRestore)).toEqual([true, true]);
    });

    it("lets Medaris yönetimi read it but names no platform code that brings a course back", async () => {
      const { service } = serviceWith(page([item({ archivedLevel: "kosk" })]));
      const result = await service.listForKosk(MEDARIS, KOSK, {
        page: 1,
        limit: 10,
      });
      // No platform code hides a course: only the başnazım acts at that level.
      expect(result.items[0].canRestore).toBe(false);
    });
  });

  describe("a course's archive", () => {
    const page = (rows: IArchiveItem[], counted = new Map()) => ({
      list: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      countByType: vi.fn().mockResolvedValue(counted),
      archivers: vi.fn().mockResolvedValue(new Map()),
    });

    it("lists the weeks and sessions of that one course, with the tabs' numbers", async () => {
      const repo = page(
        [],
        new Map([
          ["week", 2],
          ["session", 3],
        ])
      );
      const { service } = serviceWith(repo);
      const result = await service.listForCourse(MUDERRIS, ID, {
        page: 1,
        limit: 10,
      });
      expect(repo.list.mock.calls[0][0]).toMatchObject({
        courseId: ID,
        types: ["week", "session"],
      });
      expect(repo.countByType).toHaveBeenCalledWith({
        courseId: ID,
        types: ["week", "session"],
      });
      expect(result.counts).toEqual({ all: 5, week: 2, session: 3 });
    });

    it("narrows to the types asked for and reads nothing for types it does not hold", async () => {
      const repo = page([], new Map([["week", 1]]));
      const { service } = serviceWith(repo);
      await service.listForCourse(MUDERRIS, ID, {
        types: ["session", "deck" as never],
        page: 1,
        limit: 10,
      });
      expect(repo.list.mock.calls[0][0]).toMatchObject({ types: ["session"] });
      repo.list.mockClear();
      const none = await service.listForCourse(MUDERRIS, ID, {
        types: ["deck" as never],
        page: 1,
        limit: 10,
      });
      expect(repo.list).not.toHaveBeenCalled();
      expect(none).toMatchObject({ items: [], total: 0 });
      expect(none.counts.all).toBe(1);
    });

    it("says a müderris may bring back what they hid, and not what the köşk did", async () => {
      const week = (level: HideLevel) =>
        item({ type: "week", id: `w-${level}`, archivedLevel: level });
      const { service } = serviceWith(page([week("course"), week("kosk")]));
      const result = await service.listForCourse(MUDERRIS, ID, {
        page: 1,
        limit: 10,
      });
      expect(result.items.map((i) => i.canRestore)).toEqual([true, false]);
    });
  });

  describe("restore", () => {
    const restored = (title = "Maksûd okumaları") =>
      vi.fn().mockResolvedValue({ status: "restored", title });

    it("lets a köşk manager restore a course of their köşk, at the köşk level", async () => {
      const restore = restored();
      const found = item();
      const { service, effective } = serviceWith({
        findOne: vi.fn().mockResolvedValue(found),
        restore,
      });
      await expect(service.restore(NAZIM, "course", ID)).resolves.toEqual({
        type: "course",
        id: ID,
        title: "Maksûd okumaları",
      });
      // The codes are asked on the course, where they are held.
      expect(effective).toHaveBeenCalledWith(NAZIM, {
        entity: "course",
        id: ID,
      });
      expect(restore).toHaveBeenCalledWith(found, { id: "a2", level: "kosk" });
    });

    it.each([
      "course",
      "week",
      "session",
    ] as const)("asks whether the course is open before it restores a %s, and writes nothing when it is closed", async (type) => {
      const closed = new Error("closed");
      const restore = restored();
      const { service, assertOpen } = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(item({ type })),
          restore,
        },
        async () => {
          throw closed;
        }
      );
      await expect(service.restore(NAZIM, type, ID)).rejects.toBe(closed);
      expect(assertOpen).toHaveBeenCalledWith(NAZIM, {
        entity: "course",
        id: ID,
      });
      expect(restore).not.toHaveBeenCalled();
    });

    it("does not ask it of a deck, whose resource is the köşk", async () => {
      const { service, assertOpen } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item({ type: "deck" })),
        restore: restored(),
      });
      await service.restore(NAZIM, "deck", ID);
      expect(assertOpen).not.toHaveBeenCalled();
    });

    it.each([
      ["week", "course"],
      ["session", "course"],
    ] as const)("lets a müderris restore a %s hidden at the %s level", async (type, level) => {
      const restore = restored();
      const { service } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type, archivedLevel: level })),
        restore,
      });
      await expect(service.restore(MUDERRIS, type, ID)).resolves.toMatchObject({
        id: ID,
      });
      expect(restore.mock.calls[0][1]).toEqual({ id: "a4", level: "course" });
    });

    it.each([
      "week",
      "session",
    ] as const)("refuses a müderris what the köşk hid, naming both levels", async (type) => {
      const { service } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type, archivedLevel: "kosk" })),
        restore: vi.fn(),
      });
      await expect(service.restore(MUDERRIS, type, ID)).rejects.toMatchObject({
        constructor: ArchiveRestoreLevelError,
        code: "ARCHIVE_RESTORE_LEVEL",
        context: { hiddenAt: "kosk", yourLevel: "course" },
      });
    });

    it("gives a müderris no way to bring a course back: no code of theirs hides one", async () => {
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item({ archivedLevel: "course" })),
        restore: vi.fn(),
      });
      await expect(
        service.restore(MUDERRIS, "course", ID)
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);
    });

    it("lets whoever may hide a session with session.manage bring it back, but not a week", async () => {
      // A person holding only `session.manage` hides a session (DELETE
      // /lessons/:id) and so must be able to undo it; a week is `week.hide`'s.
      const manager = { sub: "a8" };
      HOLDS.a8 = [P.SESSION_MANAGE];
      try {
        const { service } = serviceWith({
          findOne: vi
            .fn()
            .mockResolvedValueOnce(
              item({ type: "session", archivedLevel: "course" })
            )
            .mockResolvedValueOnce(
              item({ type: "week", archivedLevel: "course" })
            ),
          restore: restored(),
        });
        await expect(
          service.restore(manager, "session", ID)
        ).resolves.toMatchObject({ id: ID });
        await expect(
          service.restore(manager, "week", ID)
        ).rejects.toBeInstanceOf(ArchiveForbiddenError);
      } finally {
        delete HOLDS.a8;
      }
    });

    it("refuses someone who holds nothing where the item sits", async () => {
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        restore: vi.fn(),
      });
      await expect(
        service.restore(STRANGER, "course", ID)
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);
    });

    it("leaves a deck to the köşk's manager, and a köşk's to the köşk's manager and Medaris yönetimi", async () => {
      const deck = item({ type: "deck", courseId: null });
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(deck),
        restore: restored("Deste"),
      });
      await expect(service.restore(NAZIM, "deck", ID)).resolves.toMatchObject({
        type: "deck",
      });
      await expect(
        service.restore(MUDERRIS, "deck", ID)
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);

      const kosk = serviceWith({
        findOne: vi.fn().mockResolvedValue(
          item({
            type: "kosk",
            id: KOSK,
            courseId: null,
            archivedLevel: "platform",
          })
        ),
        restore: restored("Köşk"),
      }).service;
      // The köşk's own nazımı cannot reopen what the platform hid.
      await expect(kosk.restore(NAZIM, "kosk", KOSK)).rejects.toMatchObject({
        constructor: ArchiveRestoreLevelError,
        context: { hiddenAt: "platform", yourLevel: "kosk" },
      });
      await expect(kosk.restore(MEDARIS, "kosk", KOSK)).resolves.toMatchObject({
        id: KOSK,
      });
    });

    it("keeps an item with no storage for the başnazım", async () => {
      const { service } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type: "deck", koskId: null })),
        restore: restored(),
      });
      await expect(service.restore(NAZIM, "deck", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      await expect(service.restore(ADMIN, "deck", ID)).resolves.toMatchObject({
        id: ID,
      });
    });

    it("answers a missing item with not-found and a hidden parent with a conflict", async () => {
      const missing = serviceWith({
        findOne: vi.fn().mockResolvedValue(null),
      }).service;
      await expect(missing.restore(ADMIN, "course", ID)).rejects.toBeInstanceOf(
        ArchiveItemNotFoundError
      );

      const blocked = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        restore: vi.fn().mockResolvedValue({ status: "parent-hidden" }),
      }).service;
      await expect(blocked.restore(ADMIN, "course", ID)).rejects.toBeInstanceOf(
        ArchiveParentHiddenError
      );
    });
  });

  describe("delete", () => {
    it("writes the caller's name with the delete", async () => {
      const purge = vi.fn().mockResolvedValue(true);
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        displayName: vi.fn().mockResolvedValue("Yusuf Ziya Ertuğrul"),
        purge,
      });
      await service.delete(ADMIN, "course", ID);
      expect(purge).toHaveBeenCalledWith("course", ID, {
        id: "a1",
        name: "Yusuf Ziya Ertuğrul",
      });
    });

    it("is not-found when it was deleted meanwhile", async () => {
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        displayName: vi.fn().mockResolvedValue(null),
        purge: vi.fn().mockResolvedValue(false),
      });
      await expect(service.delete(ADMIN, "course", ID)).rejects.toBeInstanceOf(
        ArchiveItemNotFoundError
      );
    });
  });

  describe("a medrese's archive", () => {
    const hiddenIn = (over: Partial<IArchiveItem> = {}) =>
      item({ koskId: KOSK, madrasahId: MADRASAH, ...over });
    const archivers = () => vi.fn().mockResolvedValue(new Map());
    const hiddenAt = (archivedLevel: HideLevel | null) =>
      hiddenIn({ archivedLevel });
    const shown = {
      hidden: false,
      archivedAt: null,
      archivedBy: null,
      archivedLevel: null,
    };

    it("lists the medrese's courses and what is in them, with the tabs' numbers", async () => {
      const list = vi.fn().mockResolvedValue([]);
      const countByType = vi.fn().mockResolvedValue(
        new Map([
          ["course", 1],
          ["week", 3],
          ["session", 2],
        ])
      );
      const { service } = serviceWith({
        list,
        count: vi.fn().mockResolvedValue(0),
        countByType,
        archivers: vi.fn().mockResolvedValue(new Map()),
        madrasahHide: vi.fn().mockResolvedValue(shown),
      });
      const page = await service.listForMadrasah(ADMIN, MADRASAH, {
        types: ["week", "session", "deck" as never],
        page: 1,
        limit: 10,
      });
      expect(list.mock.calls[0][0]).toMatchObject({
        madrasahId: MADRASAH,
        types: ["week", "session"],
      });
      expect(countByType).toHaveBeenCalledWith({
        madrasahId: MADRASAH,
        types: ["course", "week", "session", "recording"],
      });
      expect(page.counts).toEqual({
        all: 6,
        course: 1,
        week: 3,
        session: 2,
        recording: 0,
      });
    });

    it("reads nothing when only types a medrese's archive does not hold are asked for", async () => {
      const list = vi.fn();
      const { service } = serviceWith({
        list,
        countByType: vi.fn().mockResolvedValue(new Map([["course", 2]])),
        madrasahHide: vi.fn().mockResolvedValue(shown),
      });
      const page = await service.listForMadrasah(ADMIN, MADRASAH, {
        types: ["deck", "kosk"],
        page: 1,
        limit: 10,
      });
      expect(list).not.toHaveBeenCalled();
      expect(page).toMatchObject({ items: [], total: 0 });
      expect(page.counts.all).toBe(2);
    });

    const listing = (user: AuthenticatedUser, level: HideLevel | null) =>
      serviceWith({
        list: vi.fn().mockResolvedValue([hiddenAt(level)]),
        count: vi.fn().mockResolvedValue(1),
        countByType: vi.fn().mockResolvedValue(new Map()),
        archivers: archivers(),
        madrasahHide: vi.fn().mockResolvedValue(shown),
      }).service.listForMadrasah(user, MADRASAH, { page: 1, limit: 10 });

    it.each([
      ["a müderris", "course"],
      ["a başmüderris", "madrasah"],
    ] as const)("says an item %s hid can be brought back by the başmüderris", async (_who, level) => {
      expect((await listing(HEAD, level)).items[0].canRestore).toBe(true);
    });

    it.each([
      ["a köşk nazımı", "kosk"],
      ["the Medaris administration", "platform"],
    ] as const)("says an item %s hid cannot be brought back by the başmüderris", async (_who, level) => {
      expect((await listing(HEAD, level)).items[0].canRestore).toBe(false);
    });

    it("lets the köşk nazımı restore what the medrese's level hid, and the başnazım anything", async () => {
      for (const level of ["course", "madrasah", "kosk"] as const) {
        expect((await listing(NAZIM, level)).items[0].canRestore).toBe(true);
      }
      // What the platform hid is above the köşk's nazımı.
      expect((await listing(NAZIM, "platform")).items[0].canRestore).toBe(
        false
      );
      for (const level of ["course", "madrasah", "kosk", "platform"] as const) {
        expect((await listing(ADMIN, level)).items[0].canRestore).toBe(true);
      }
    });

    describe("the medrese itself", () => {
      const stateFor = (
        user: AuthenticatedUser,
        hide: Record<string, unknown>
      ) =>
        serviceWith({
          list: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          countByType: vi.fn().mockResolvedValue(new Map()),
          archivers: vi
            .fn()
            .mockResolvedValue(
              new Map([
                [
                  `madrasah:${MADRASAH}`,
                  { id: "a3", name: "Yusuf", role: "MEDRESE_BASMUDERRIS" },
                ],
              ])
            ),
          madrasahHide: vi.fn().mockResolvedValue(hide),
        })
          .service.listForMadrasah(user, MADRASAH, { page: 1, limit: 10 })
          .then((page) => page.madrasah);

      const hiddenBy = (archivedLevel: HideLevel | null) => ({
        hidden: true,
        archivedAt: new Date("2026-10-02T08:00:00Z"),
        archivedBy: "a3",
        archivedLevel,
      });

      it("says nothing is hidden while the medrese is shown", async () => {
        expect(await stateFor(HEAD, shown)).toEqual({
          hidden: false,
          hiddenAt: null,
          hiddenLevel: null,
          hiddenBy: null,
          canRestore: false,
        });
      });

      it("lets the başmüderris bring back what they hid, and Medaris yönetimi anything", async () => {
        const mine = await stateFor(HEAD, hiddenBy("madrasah"));
        expect(mine).toMatchObject({
          hidden: true,
          hiddenLevel: "madrasah",
          canRestore: true,
          hiddenBy: { id: "a3", role: "MEDRESE_BASMUDERRIS" },
        });
        expect(
          (await stateFor(MEDARIS_MADRASAH, hiddenBy("madrasah"))).canRestore
        ).toBe(true);
        expect(
          (await stateFor(MEDARIS_MADRASAH, hiddenBy("platform"))).canRestore
        ).toBe(true);
        expect((await stateFor(ADMIN, hiddenBy("platform"))).canRestore).toBe(
          true
        );
      });

      it("refuses the başmüderris what the platform hid, and a person who holds neither code", async () => {
        const byPlatform = await stateFor(HEAD, hiddenBy("platform"));
        expect(byPlatform).toMatchObject({
          hiddenLevel: "platform",
          canRestore: false,
        });
        // The köşk's nazımı holds no medrese code here.
        expect((await stateFor(NAZIM, hiddenBy("madrasah"))).canRestore).toBe(
          false
        );
      });

      it("counts a medrese hidden before the level was recorded as the medrese's own", async () => {
        const legacy = await stateFor(HEAD, hiddenBy(null));
        expect(legacy).toMatchObject({
          hiddenLevel: "madrasah",
          canRestore: true,
        });
      });
    });
  });
});
