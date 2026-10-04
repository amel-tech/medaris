import {
  type AuthzService,
  ENTITIES,
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
import { KoskNotFoundError } from "../../../src/kosk/errors/kosk-not-found.error";
import type { KoskService } from "../../../src/kosk/kosk.service";

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const NAZIM = { sub: "a2" };
const HEAD = { sub: "a3" };
const MADRASAH = "b0000000-0000-4000-8000-0000000000cc";
const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const ID = "b0000000-0000-4000-8000-0000000000bb";

/** What each caller holds on the course, as the engine would answer. */
const KOSK_NAZIM_CODES: PermissionCode[] = [PERMISSIONS.COURSE_HIDE];
const HEAD_CODES: PermissionCode[] = [PERMISSIONS.MADRASAH_COURSE_HIDE];
/** A medrese that is shown, as the repository reads it. */
const SHOWN_MADRASAH = {
  hidden: false,
  archivedAt: null,
  archivedBy: null,
  archivedLevel: null,
};
/** The course team's work: what a müderris holds on their course by role default. */
const MUDERRIS_CODES: PermissionCode[] = [
  PERMISSIONS.WEEK_HIDE,
  PERMISSIONS.SESSION_MANAGE,
];

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

/**
 * `codes` is what the caller holds on any course (the engine's answer);
 * `manages` whether they are a manager of the köşk (the köşk archive and decks).
 */
function serviceWith(
  repo: Partial<Record<keyof ArchiveRepository, unknown>>,
  codes: readonly PermissionCode[] = KOSK_NAZIM_CODES,
  manages = codes.includes(PERMISSIONS.COURSE_HIDE),
  assertOpen: () => Promise<void> = async () => undefined
) {
  const koskService = {
    isManager: vi.fn().mockResolvedValue(manages),
  } as unknown as KoskService;
  const effective = vi.fn().mockResolvedValue({
    codes: new Set(codes),
    openedPassive: null,
  });
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
    effective,
    assertOpen: vi.fn(assertOpen),
  } as unknown as AuthzService;
  return {
    service: new ArchiveService(
      repo as unknown as ArchiveRepository,
      koskService,
      authz
    ),
    koskService,
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
    it("lists a köşk's contents only, never the köşk or a medrese", async () => {
      const list = vi.fn().mockResolvedValue([]);
      const { service } = serviceWith({
        koskExists: vi.fn().mockResolvedValue(true),
        list,
        count: vi.fn().mockResolvedValue(0),
        archivers: vi.fn().mockResolvedValue(new Map()),
      });
      await service.listForKosk(NAZIM, KOSK, { page: 1, limit: 10 });
      expect(list.mock.calls[0][0]).toMatchObject({
        koskId: KOSK,
        types: ["course", "week", "session", "recording", "deck"],
      });
    });

    it("says of each item whether its nazımı may bring it back: not what the platform hid (MDRS-108)", async () => {
      const { service } = serviceWith({
        koskExists: vi.fn().mockResolvedValue(true),
        list: vi
          .fn()
          .mockResolvedValue([
            item({ id: "c1", courseId: "c1", archivedLevel: "kosk" }),
            item({ id: "c2", courseId: "c2", archivedLevel: "platform" }),
          ]),
        count: vi.fn().mockResolvedValue(2),
        archivers: vi.fn().mockResolvedValue(new Map()),
      });
      const page = await service.listForKosk(NAZIM, KOSK, {
        page: 1,
        limit: 10,
      });
      expect(page.items.map((i) => [i.id, i.canRestore])).toEqual([
        ["c1", true],
        ["c2", false],
      ]);
    });

    it("lets Medaris yönetimi read it but names no platform code that brings a course back", async () => {
      const { service } = serviceWith(
        {
          koskExists: vi.fn().mockResolvedValue(true),
          list: vi
            .fn()
            .mockResolvedValue([item({ id: "c1", archivedLevel: "kosk" })]),
          count: vi.fn().mockResolvedValue(1),
          archivers: vi.fn().mockResolvedValue(new Map()),
        },
        [PERMISSIONS.PLATFORM_KOSK_EDIT],
        false
      );
      const page = await service.listForKosk(NAZIM, KOSK, {
        page: 1,
        limit: 10,
      });
      // No platform code hides a course: only the başnazım acts at that level.
      expect(page.items[0].canRestore).toBe(false);
    });

    it("is a 404 for a köşk that is not there", async () => {
      const { service } = serviceWith({
        koskExists: vi.fn().mockResolvedValue(false),
      });
      await expect(
        service.listForKosk(NAZIM, KOSK, { page: 1, limit: 10 })
      ).rejects.toBeInstanceOf(KoskNotFoundError);
    });
  });

  describe("a course's archive", () => {
    const week = (level: HideLevel) =>
      item({ type: "week", id: `w-${level}`, archivedLevel: level });
    const course = (rows: IArchiveItem[], counted = new Map()) => ({
      list: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(rows.length),
      countByType: vi.fn().mockResolvedValue(counted),
      archivers: vi.fn().mockResolvedValue(new Map()),
      weekRestoresSessions: vi.fn().mockResolvedValue(true),
    });

    it("lists the weeks and sessions of that one course, with the tabs' numbers", async () => {
      const repo = course(
        [],
        new Map([
          ["week", 2],
          ["session", 3],
        ])
      );
      const { service } = serviceWith(repo, MUDERRIS_CODES, false);
      const result = await service.listForCourse(NAZIM, ID, {
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
      const repo = course([], new Map([["week", 1]]));
      const { service } = serviceWith(repo, MUDERRIS_CODES, false);
      await service.listForCourse(NAZIM, ID, {
        types: ["session", "deck" as never],
        page: 1,
        limit: 10,
      });
      expect(repo.list.mock.calls[0][0]).toMatchObject({ types: ["session"] });
      repo.list.mockClear();
      const none = await service.listForCourse(NAZIM, ID, {
        types: ["deck" as never],
        page: 1,
        limit: 10,
      });
      expect(repo.list).not.toHaveBeenCalled();
      expect(none).toMatchObject({ items: [], total: 0 });
      expect(none.counts.all).toBe(1);
    });

    it("says whoever runs the course may bring back what they hid, and not what the köşk did", async () => {
      const { service } = serviceWith(
        course([week("course"), week("kosk")]),
        MUDERRIS_CODES,
        false
      );
      const result = await service.listForCourse(NAZIM, ID, {
        page: 1,
        limit: 10,
      });
      expect(result.items.map((i) => i.canRestore)).toEqual([true, false]);
    });
  });

  describe("restore", () => {
    it("asks the engine on the course and restores at the köşk's level for its nazımı", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const { service, effective } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        restore,
      });
      await expect(service.restore(NAZIM, "course", ID)).resolves.toEqual({
        type: "course",
        id: ID,
        title: "Maksûd okumaları",
      });
      expect(effective).toHaveBeenCalledWith(NAZIM, {
        entity: ENTITIES.COURSE,
        id: ID,
      });
      expect(restore).toHaveBeenCalledWith(
        "course",
        ID,
        "kosk",
        NAZIM.sub,
        "kosk"
      );
    });

    it("decides a week by its course", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Hafta 1" });
      const { service, effective } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type: "week", id: "w1", courseId: ID })),
        restore,
      });
      await service.restore(NAZIM, "week", "w1");
      expect(effective).toHaveBeenCalledWith(NAZIM, {
        entity: ENTITIES.COURSE,
        id: ID,
      });
      expect(restore).toHaveBeenCalledWith(
        "week",
        "w1",
        "kosk",
        NAZIM.sub,
        "kosk"
      );
    });

    it("restores a session or a week at the course's level for whoever runs the course, and not the course itself (review C-archive-3)", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Celse" });
      const muderris = [PERMISSIONS.SESSION_MANAGE, PERMISSIONS.COURSE_EDIT];
      const session = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(
              item({ type: "session", id: "s1", courseId: ID })
            ),
          restore,
        },
        muderris,
        false
      ).service;
      await session.restore(NAZIM, "session", "s1");
      expect(restore).toHaveBeenCalledWith(
        "session",
        "s1",
        "course",
        NAZIM.sub,
        "course"
      );

      const course = serviceWith(
        { findOne: vi.fn().mockResolvedValue(item()), restore },
        muderris,
        false
      ).service;
      await expect(course.restore(NAZIM, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
    });

    it("keeps sessions from a caller holding only course.edit, and lets them bring back a week with none in it (review D2-7-archive-restore-sibling)", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Hafta 1" });
      const editor = [PERMISSIONS.COURSE_EDIT];
      const session = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(
              item({ type: "session", id: "s1", courseId: ID })
            ),
          restore,
        },
        editor,
        false
      ).service;
      await expect(
        session.restore(NAZIM, "session", "s1")
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);
      expect(restore).not.toHaveBeenCalled();

      // A week: the editor's level for the week alone, none for its sessions;
      // the repository decides which applies under the row lock.
      const week = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(item({ type: "week", id: "w1", courseId: ID })),
          restore,
        },
        editor,
        false
      ).service;
      await week.restore(NAZIM, "week", "w1");
      expect(restore).toHaveBeenCalledWith(
        "week",
        "w1",
        "course",
        NAZIM.sub,
        null
      );

      const refused = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(item({ type: "week", id: "w1", courseId: ID })),
          restore: vi.fn().mockResolvedValue({ status: "forbidden" }),
        },
        editor,
        false
      ).service;
      await expect(refused.restore(NAZIM, "week", "w1")).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
    });

    it("offers Geri al on a week to a caller holding only course.edit only when it brings no session back", async () => {
      const listing = (bringsSessions: boolean) =>
        serviceWith(
          {
            list: vi
              .fn()
              .mockResolvedValue([
                item({ type: "week", id: "w1", courseId: ID }),
              ]),
            count: vi.fn().mockResolvedValue(1),
            countByType: vi.fn().mockResolvedValue(new Map()),
            archivers: vi.fn().mockResolvedValue(new Map()),
            madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
            weekRestoresSessions: vi.fn().mockResolvedValue(bringsSessions),
          },
          [PERMISSIONS.COURSE_EDIT],
          false
        ).service.listForMadrasah(NAZIM, MADRASAH, { page: 1, limit: 10 });
      expect((await listing(false)).items[0].canRestore).toBe(true);
      expect((await listing(true)).items[0].canRestore).toBe(false);
    });

    it.each([
      "course",
      "week",
      "session",
    ] as const)("asks whether the course is open before it restores a %s, and writes nothing when it is closed (MDRS-143)", async (type) => {
      const closed = new Error("closed");
      const restore = vi.fn();
      const { service, assertOpen } = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(item({ type })),
          restore,
        },
        KOSK_NAZIM_CODES,
        true,
        async () => {
          throw closed;
        }
      );
      await expect(service.restore(NAZIM, type, ID)).rejects.toBe(closed);
      expect(assertOpen).toHaveBeenCalledWith(NAZIM, {
        entity: ENTITIES.COURSE,
        id: ID,
      });
      expect(restore).not.toHaveBeenCalled();
    });

    it("does not ask it of a deck, whose resource is the köşk", async () => {
      const { service, assertOpen } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type: "deck", courseId: null })),
        restore: vi.fn().mockResolvedValue({ status: "restored", title: "D" }),
      });
      await service.restore(NAZIM, "deck", ID);
      expect(assertOpen).not.toHaveBeenCalled();
    });

    it.each([
      "week",
      "session",
    ] as const)("refuses the course team what the köşk hid, naming both levels (the level is compared under the row lock)", async (type) => {
      const { service } = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(item({ type, archivedLevel: "kosk" })),
          weekRestoresSessions: vi.fn().mockResolvedValue(true),
          restore: vi
            .fn()
            .mockResolvedValue({ status: "level", hiddenAt: "kosk" }),
        },
        MUDERRIS_CODES,
        false
      );
      await expect(service.restore(NAZIM, type, ID)).rejects.toMatchObject({
        constructor: ArchiveRestoreLevelError,
        code: "ARCHIVE_RESTORE_LEVEL",
        context: { hiddenAt: "kosk", yourLevel: "course" },
      });
    });

    it("restores at the platform's level for platform management holding platform.course_hide", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const { service } = serviceWith(
        { findOne: vi.fn().mockResolvedValue(item()), restore },
        [PERMISSIONS.PLATFORM_COURSE_HIDE]
      );
      await service.restore(NAZIM, "course", ID);
      expect(restore).toHaveBeenCalledWith(
        "course",
        ID,
        "platform",
        NAZIM.sub,
        "platform"
      );
    });

    it("keeps köşks for the başnazım and a deck for its köşk's nazımı", async () => {
      const deck = serviceWith(
        {
          findOne: vi
            .fn()
            .mockResolvedValue(item({ type: "deck", courseId: null })),
        },
        [],
        false
      ).service;
      await expect(deck.restore(NAZIM, "deck", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      const kosk = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type: "kosk", courseId: null })),
      }).service;
      await expect(kosk.restore(NAZIM, "kosk", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
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
        madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
        archivers: vi.fn().mockResolvedValue(new Map()),
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
        madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
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

    describe("the medrese itself", () => {
      const shown = SHOWN_MADRASAH;
      const hiddenBy = (archivedLevel: HideLevel | null) => ({
        hidden: true,
        archivedAt: new Date("2026-10-02T08:00:00Z"),
        archivedBy: "a3",
        archivedLevel,
      });
      const stateFor = (
        user: typeof NAZIM,
        codes: readonly PermissionCode[],
        hide: Record<string, unknown>
      ) =>
        serviceWith(
          {
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
          },
          codes,
          false
        )
          .service.listForMadrasah(user, MADRASAH, { page: 1, limit: 10 })
          .then((page) => page.madrasah);

      const HEAD_OF = [PERMISSIONS.MADRASAH_HIDE];
      const MEDARIS = [PERMISSIONS.PLATFORM_MADRASAH_EDIT];

      it("says nothing is hidden while the medrese is shown", async () => {
        expect(await stateFor(HEAD, HEAD_OF, shown)).toEqual({
          hidden: false,
          hiddenAt: null,
          hiddenLevel: null,
          hiddenBy: null,
          canRestore: false,
        });
      });

      it("lets the başmüderris bring back what they hid, and Medaris yönetimi anything", async () => {
        expect(
          await stateFor(HEAD, HEAD_OF, hiddenBy("madrasah"))
        ).toMatchObject({
          hidden: true,
          hiddenLevel: "madrasah",
          canRestore: true,
          hiddenBy: { id: "a3", role: "MEDRESE_BASMUDERRIS" },
        });
        expect(
          (await stateFor(NAZIM, MEDARIS, hiddenBy("madrasah"))).canRestore
        ).toBe(true);
        expect(
          (await stateFor(NAZIM, MEDARIS, hiddenBy("platform"))).canRestore
        ).toBe(true);
        expect(
          (await stateFor(ADMIN as never, [], hiddenBy("platform"))).canRestore
        ).toBe(true);
      });

      it("refuses the başmüderris what the platform hid, and a person who holds neither code", async () => {
        expect(
          await stateFor(HEAD, HEAD_OF, hiddenBy("platform"))
        ).toMatchObject({ hiddenLevel: "platform", canRestore: false });
        // The köşk's nazımı holds no medrese code here.
        expect(
          (await stateFor(NAZIM, KOSK_NAZIM_CODES, hiddenBy("madrasah")))
            .canRestore
        ).toBe(false);
      });

      it("counts a medrese hidden before the level was recorded as the medrese's own", async () => {
        expect(await stateFor(HEAD, HEAD_OF, hiddenBy(null))).toMatchObject({
          hiddenLevel: "madrasah",
          canRestore: true,
        });
      });
    });

    it.each([
      ["a müderris", "course"],
      ["a başmüderris", "madrasah"],
    ] as const)("says an item %s hid can be brought back by the başmüderris", async (_who, level) => {
      const { service } = serviceWith(
        {
          list: vi.fn().mockResolvedValue([hiddenAt(level)]),
          count: vi.fn().mockResolvedValue(1),
          countByType: vi.fn().mockResolvedValue(new Map()),
          madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
          archivers: archivers(),
        },
        HEAD_CODES
      );
      const page = await service.listForMadrasah(HEAD, MADRASAH, {
        page: 1,
        limit: 10,
      });
      expect(page.items[0].canRestore).toBe(true);
    });

    it.each([
      ["a köşk nazımı", "kosk"],
      ["the Medaris administration", "platform"],
    ] as const)("says an item %s hid cannot be brought back by the başmüderris", async (_who, level) => {
      const { service } = serviceWith(
        {
          list: vi.fn().mockResolvedValue([hiddenAt(level)]),
          count: vi.fn().mockResolvedValue(1),
          countByType: vi.fn().mockResolvedValue(new Map()),
          madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
          archivers: archivers(),
        },
        HEAD_CODES
      );
      const page = await service.listForMadrasah(HEAD, MADRASAH, {
        page: 1,
        limit: 10,
      });
      expect(page.items[0].canRestore).toBe(false);
    });

    it("lets the köşk nazımı restore what the medrese's level hid, and the başnazım anything", async () => {
      const listing = (user: typeof NAZIM, level: HideLevel) =>
        serviceWith(
          {
            list: vi.fn().mockResolvedValue([hiddenAt(level)]),
            count: vi.fn().mockResolvedValue(1),
            countByType: vi.fn().mockResolvedValue(new Map()),
            madrasahHide: vi.fn().mockResolvedValue(SHOWN_MADRASAH),
            archivers: archivers(),
          },
          KOSK_NAZIM_CODES
        ).service.listForMadrasah(user, MADRASAH, { page: 1, limit: 10 });
      for (const level of ["course", "madrasah", "kosk"] as const) {
        expect((await listing(NAZIM, level)).items[0].canRestore).toBe(true);
      }
      // What the platform hid is above the köşk's nazımı.
      expect((await listing(NAZIM, "platform")).items[0].canRestore).toBe(
        false
      );
      for (const level of ["course", "madrasah", "kosk", "platform"] as const) {
        expect((await listing(ADMIN as never, level)).items[0].canRestore).toBe(
          true
        );
      }
    });

    it("lets the başmüderris restore what a lower kademe hid, and refuses what a higher one did", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const allowed = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenAt("course")),
          restore,
        },
        HEAD_CODES
      ).service;
      await expect(allowed.restore(HEAD, "course", ID)).resolves.toMatchObject({
        id: ID,
      });

      expect(restore).toHaveBeenCalledWith(
        "course",
        ID,
        "madrasah",
        HEAD.sub,
        "madrasah"
      );

      // The level is compared under the row lock: the repository says so.
      const refused = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenAt("kosk")),
          restore: vi
            .fn()
            .mockResolvedValue({ status: "level", hiddenAt: "kosk" }),
        },
        HEAD_CODES
      ).service;
      await expect(refused.restore(HEAD, "course", ID)).rejects.toMatchObject({
        constructor: ArchiveRestoreLevelError,
        code: "ARCHIVE_RESTORE_LEVEL",
        context: { hiddenAt: "kosk", yourLevel: "madrasah" },
      });
    });

    it("lets a nazır given madrasah.course_hide restore at the medrese's level, as they hide", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const { service } = serviceWith(
        { findOne: vi.fn().mockResolvedValue(hiddenAt("madrasah")), restore },
        [PERMISSIONS.MADRASAH_COURSE_HIDE],
        false
      );
      await expect(service.restore(HEAD, "course", ID)).resolves.toMatchObject({
        id: ID,
      });
      expect(restore).toHaveBeenCalledWith(
        "course",
        ID,
        "madrasah",
        HEAD.sub,
        "madrasah"
      );
    });

    it("counts a row hidden before the level was recorded as the lowest level that could have hidden it", async () => {
      // A medrese's course: the medrese could hide it, so the başmüderris may restore it.
      const legacyMedrese = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenAt(null)),
          restore: vi
            .fn()
            .mockResolvedValue({ status: "restored", title: "Maksûd" }),
        },
        HEAD_CODES
      ).service;
      await expect(
        legacyMedrese.restore(HEAD, "course", ID)
      ).resolves.toMatchObject({ id: ID });

      // A köşk's own course: only the köşk could have hidden it; a köşk nazımı restores it.
      const legacyKosk = serviceWith({
        findOne: vi.fn().mockResolvedValue(item({ archivedBy: null })),
        restore: vi
          .fn()
          .mockResolvedValue({ status: "restored", title: "Maksûd" }),
      }).service;
      await expect(
        legacyKosk.restore(NAZIM, "course", ID)
      ).resolves.toMatchObject({ id: ID });
    });

    it("names the köşk nazımı's level when a platform hide is not theirs to undo", async () => {
      const { service } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item({ archivedLevel: "platform" })),
        restore: vi
          .fn()
          .mockResolvedValue({ status: "level", hiddenAt: "platform" }),
      });
      await expect(service.restore(NAZIM, "course", ID)).rejects.toMatchObject({
        constructor: ArchiveRestoreLevelError,
        context: { hiddenAt: "platform", yourLevel: "kosk" },
      });
    });

    it("does not let the başmüderris of another medrese, or a stranger, restore", async () => {
      const restore = vi.fn();
      const { service } = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenAt("course")),
          restore,
        },
        [],
        false
      );
      await expect(service.restore(HEAD, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      expect(restore).not.toHaveBeenCalled();
    });
  });
});
