import type { AuthzService } from "@medaris/common";
import type { ArchiveRepository } from "../../../src/archive/archive.repository";
import { ArchiveService } from "../../../src/archive/archive.service";
import type { IArchiveItem } from "../../../src/archive/archive-types";
import {
  ArchiveForbiddenError,
  ArchiveItemNotFoundError,
  ArchiveParentHiddenError,
} from "../../../src/archive/errors/archive-errors";
import type { KoskService } from "../../../src/kosk/kosk.service";

const ADMIN = { sub: "a1", realm_access: { roles: ["SYSTEM_ADMIN"] } };
const NAZIM = { sub: "a2" };
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
  manages = true
) {
  const koskService = {
    isManager: vi.fn().mockResolvedValue(manages),
  } as unknown as KoskService;
  const authz = {
    isSystemAdmin: (u: { realm_access?: { roles?: string[] } }) =>
      u.realm_access?.roles?.includes("SYSTEM_ADMIN") ?? false,
  } as unknown as AuthzService;
  return {
    service: new ArchiveService(
      repo as unknown as ArchiveRepository,
      koskService,
      authz
    ),
    koskService,
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
});
