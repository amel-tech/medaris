import type { AuthzService } from "@medaris/common";
import type { ArchiveRepository } from "../../../src/archive/archive.repository";
import {
  ArchiveService,
  hiderTier,
} from "../../../src/archive/archive.service";
import type { IArchiveItem } from "../../../src/archive/archive-types";
import {
  ArchiveForbiddenError,
  ArchiveItemNotFoundError,
  ArchiveParentHiddenError,
} from "../../../src/archive/errors/archive-errors";
import type { KoskService } from "../../../src/kosk/kosk.service";
import type { MadrasahService } from "../../../src/madrasah/madrasah.service";

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const NAZIM = { sub: "a2" };
const HEAD = { sub: "a3" };
const MADRASAH = "b0000000-0000-4000-8000-0000000000cc";
const KOSK = "b0000000-0000-4000-8000-0000000000aa";
const ID = "b0000000-0000-4000-8000-0000000000bb";

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
  ...over,
});

function serviceWith(
  repo: Partial<Record<keyof ArchiveRepository, unknown>>,
  manages = true,
  heads = false
) {
  const koskService = {
    isManager: vi.fn().mockResolvedValue(manages),
  } as unknown as KoskService;
  const madrasahService = {
    isNazir: vi.fn().mockResolvedValue(heads),
  } as unknown as MadrasahService;
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
  } as unknown as AuthzService;
  return {
    service: new ArchiveService(
      repo as unknown as ArchiveRepository,
      koskService,
      authz,
      madrasahService
    ),
    koskService,
    madrasahService,
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

    it("is refused to someone who does not manage the köşk", async () => {
      const { service } = serviceWith(
        { koskExists: vi.fn().mockResolvedValue(true) },
        false
      );
      await expect(
        service.listForKosk(NAZIM, KOSK, { page: 1, limit: 10 })
      ).rejects.toBeInstanceOf(ArchiveForbiddenError);
    });
  });

  describe("restore", () => {
    it("lets a köşk manager restore a course of their köşk", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const { service, koskService } = serviceWith({
        findOne: vi.fn().mockResolvedValue(item()),
        restore,
      });
      await expect(service.restore(NAZIM, "course", ID)).resolves.toEqual({
        type: "course",
        id: ID,
        title: "Maksûd okumaları",
      });
      expect(koskService.isManager).toHaveBeenCalledWith(KOSK, "a2");
    });

    it("keeps decks and köşks for the başnazım", async () => {
      const { service } = serviceWith({
        findOne: vi
          .fn()
          .mockResolvedValue(item({ type: "deck", koskId: null })),
      });
      await expect(service.restore(NAZIM, "deck", ID)).rejects.toBeInstanceOf(
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

  describe("hiderTier", () => {
    it("ranks the hider by the role they held where the item sits", () => {
      const hidden = { archivedBy: "a2" };
      expect(hiderTier(hidden, { role: "MUDERRIS" })).toBe(1);
      expect(hiderTier(hidden, { role: "MEDRESE_BASMUDERRIS" })).toBe(2);
      expect(hiderTier(hidden, { role: "MEDRESE_NAZIR" })).toBe(2);
      expect(hiderTier(hidden, { role: "KOSK_NAZIM" })).toBe(3);
    });

    it("treats a hider without a role as the Medaris administration, and no hider as nobody", () => {
      expect(hiderTier({ archivedBy: "a1" }, { role: null })).toBe(4);
      expect(hiderTier({ archivedBy: "a1" }, null)).toBe(4);
      expect(hiderTier({ archivedBy: null }, null)).toBe(1);
    });
  });

  describe("a medrese's archive", () => {
    const hiddenIn = (over: Partial<IArchiveItem> = {}) =>
      item({ koskId: KOSK, madrasahId: MADRASAH, ...over });
    const archivers = (role: string | null) =>
      vi
        .fn()
        .mockResolvedValue(
          new Map([[`course:${ID}`, { id: "a2", name: "Ömer", role }]])
        );

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

    it("says an item hidden by a lower or equal kademe can be brought back by the başmüderris", async () => {
      const { service } = serviceWith(
        {
          list: vi.fn().mockResolvedValue([hiddenIn()]),
          count: vi.fn().mockResolvedValue(1),
          countByType: vi.fn().mockResolvedValue(new Map()),
          archivers: archivers("MUDERRIS"),
        },
        false,
        true
      );
      const page = await service.listForMadrasah(HEAD, MADRASAH, {
        page: 1,
        limit: 10,
      });
      expect(page.items[0].canRestore).toBe(true);
    });

    it.each([
      ["a köşk nazımı", "KOSK_NAZIM"],
      ["the Medaris administration", null],
    ])("says an item %s hid cannot be brought back by the başmüderris", async (_who, role) => {
      const { service } = serviceWith(
        {
          list: vi.fn().mockResolvedValue([hiddenIn()]),
          count: vi.fn().mockResolvedValue(1),
          countByType: vi.fn().mockResolvedValue(new Map()),
          archivers: archivers(role),
        },
        false,
        true
      );
      const page = await service.listForMadrasah(HEAD, MADRASAH, {
        page: 1,
        limit: 10,
      });
      expect(page.items[0].canRestore).toBe(false);
    });

    it("leaves the köşk nazımı's own restore as it was, and the başnazım's open", async () => {
      const listing = (user: typeof NAZIM) =>
        serviceWith(
          {
            list: vi.fn().mockResolvedValue([hiddenIn()]),
            count: vi.fn().mockResolvedValue(1),
            countByType: vi.fn().mockResolvedValue(new Map()),
            archivers: archivers(null),
          },
          true
        ).service.listForMadrasah(user, MADRASAH, { page: 1, limit: 10 });
      expect((await listing(NAZIM)).items[0].canRestore).toBe(true);
      expect((await listing(ADMIN as never)).items[0].canRestore).toBe(true);
    });

    it("lets the başmüderris restore what a lower kademe hid, and refuses what a higher one did", async () => {
      const restore = vi
        .fn()
        .mockResolvedValue({ status: "restored", title: "Maksûd okumaları" });
      const allowed = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenIn()),
          archivers: archivers("MEDRESE_NAZIR"),
          restore,
        },
        false,
        true
      ).service;
      await expect(allowed.restore(HEAD, "course", ID)).resolves.toMatchObject({
        id: ID,
      });

      const refused = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenIn()),
          archivers: archivers("KOSK_NAZIM"),
          restore: vi.fn(),
        },
        false,
        true
      ).service;
      await expect(refused.restore(HEAD, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
    });

    it("does not let the başmüderris of another medrese, or a stranger, restore", async () => {
      const { service, madrasahService } = serviceWith(
        {
          findOne: vi.fn().mockResolvedValue(hiddenIn()),
          archivers: archivers("MUDERRIS"),
        },
        false,
        false
      );
      await expect(service.restore(HEAD, "course", ID)).rejects.toBeInstanceOf(
        ArchiveForbiddenError
      );
      expect(madrasahService.isNazir).toHaveBeenCalledWith(MADRASAH, "a3");
    });
  });
});
