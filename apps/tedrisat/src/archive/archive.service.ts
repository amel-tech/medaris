import { AuthenticatedUser, AuthzService, ENTITIES } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { ArchiveRepository, IArchiver } from "./archive.repository";
import {
  ArchiveItemType,
  COURSE_ARCHIVE_ITEM_TYPES,
  IArchiveFilter,
  IArchiveImpact,
  IArchiveItem,
  IArchiveScopes,
  KOSK_ARCHIVE_ITEM_TYPES,
  MADRASAH_ARCHIVE_ITEM_TYPES,
} from "./archive-types";
import {
  ArchiveForbiddenError,
  ArchiveItemNotFoundError,
  ArchiveParentHiddenError,
  ArchiveRestoreLevelError,
} from "./errors/archive-errors";
import { hideTargetOf, MADRASAH_HIDE_LADDER } from "./hide-codes";
import {
  actingLevel,
  type HideLevel,
  hiderLevelOf,
  mayRestoreAt,
  mayRestoreHidden,
} from "./hide-level";

export interface IArchiveEntry extends IArchiveItem {
  archiver: IArchiver | null;
}

export interface IArchivePage {
  items: IArchiveEntry[];
  total: number;
  page: number;
  limit: number;
}

/** An archive entry with whether the caller may bring it back (Geri al). */
export interface IRestorableEntry extends IArchiveEntry {
  canRestore: boolean;
}

export interface IRestorablePage extends IArchivePage {
  items: IRestorableEntry[];
}

export interface ICourseArchivePage extends IRestorablePage {
  /** Everything hidden in the course, per type, whatever the page was asked for. */
  counts: Record<"all" | "week" | "session", number>;
}

/** The medrese itself, for the banner nazir/12 shows when it is hidden. */
export interface IMadrasahArchiveState {
  hidden: boolean;
  hiddenAt: Date | null;
  /** The level that hid it; null while it is shown. */
  hiddenLevel: HideLevel | null;
  hiddenBy: IArchiver | null;
  /** Whether the caller may bring it back (`POST /madrasahs/:id/restore`). */
  canRestore: boolean;
}

export interface IMadrasahArchivePage extends IRestorablePage {
  madrasah: IMadrasahArchiveState;
  /** Everything hidden in the medrese, per type, whatever the page was asked for. */
  counts: Record<"all" | "course" | "week" | "session" | "recording", number>;
}

/**
 * The level the caller restores at, for an item: what `actingLevel` makes of
 * the codes they hold on it (`hide-codes.ts`), the başnazım being the platform,
 * and null when they hold none (they act at no level). A restore is by the
 * level that hid the item or any above it (`mayRestoreAt`), so the same rung of
 * the ladder that was recorded when it was hidden decides.
 */
type RestoreRoute = HideLevel | null;

/**
 * The archive (MDRS-173): what nazımlar hid, listed, restored and, for the
 * Medaris başnazımı alone, deleted for real.
 *
 * Reading a köşk's or a medrese's archive is an `@Authz` on its route. A
 * restore is decided here, per item, from the catalogue codes of its own
 * ladder (`hide-codes.ts`) and then by the kademe, since which codes count
 * depends on what the item is; the platform-wide archive, its impact counts and
 * the real delete stay the başnazım's. Anything else is `ArchiveForbiddenError`.
 */
@Injectable()
export class ArchiveService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ArchiveRepository,
    private readonly authz: AuthzService
  ) {}

  /**
   * One köşk's archive: its courses, weeks, sessions and decks, never the köşk.
   * Reached through `@Authz(kosk.manage | platform.kosk_edit)` on the route.
   * Each item says whether the caller may bring it back.
   */
  async listForKosk(
    user: AuthenticatedUser,
    koskId: string,
    query: { type?: ArchiveItemType; q?: string; page: number; limit: number }
  ): Promise<IRestorablePage> {
    if (!(await this.repo.koskExists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    return this.restorable(
      user,
      await this.page(
        { koskId, type: query.type, q: query.q },
        KOSK_ARCHIVE_ITEM_TYPES,
        query.page,
        query.limit
      )
    );
  }

  /**
   * One medrese's archive (nazir/12): the hidden courses of the medrese and
   * the weeks and sessions in them, `types` narrowing what is listed. Reached
   * through `MadrasahArchiveController`, whose `@Authz` scope lets the
   * medrese's başmüderris and SYSTEM_ADMIN in. Each item says whether the
   * caller may bring it back.
   */
  async listForMadrasah(
    user: AuthenticatedUser,
    madrasahId: string,
    query: { types?: ArchiveItemType[]; page: number; limit: number }
  ): Promise<IMadrasahArchivePage> {
    const types = query.types
      ? MADRASAH_ARCHIVE_ITEM_TYPES.filter((t) => query.types?.includes(t))
      : MADRASAH_ARCHIVE_ITEM_TYPES;
    const filter = { madrasahId };
    const [page, counted] = await Promise.all([
      // Asked only for types a medrese's archive does not hold: nothing to read.
      types.length === 0
        ? { items: [], total: 0, page: query.page, limit: query.limit }
        : this.page(filter, types, query.page, query.limit),
      this.repo.countByType({ ...filter, types: MADRASAH_ARCHIVE_ITEM_TYPES }),
    ]);
    const { items } = await this.restorable(user, page);
    const madrasah = await this.madrasahState(user, madrasahId);
    const count = (type: ArchiveItemType) => counted.get(type) ?? 0;
    return {
      ...page,
      items,
      madrasah,
      counts: {
        all: [...counted.values()].reduce((sum, n) => sum + n, 0),
        course: count("course"),
        week: count("week"),
        session: count("session"),
        recording: count("recording"),
      },
    };
  }

  private async madrasahState(
    user: AuthenticatedUser,
    madrasahId: string
  ): Promise<IMadrasahArchiveState> {
    const hide = await this.repo.madrasahHide(madrasahId);
    if (!hide.hidden) {
      return {
        hidden: false,
        hiddenAt: null,
        hiddenLevel: null,
        hiddenBy: null,
        canRestore: false,
      };
    }
    const hiddenLevel = hiderLevelOf({
      type: "madrasah",
      madrasahId,
      archivedLevel: hide.archivedLevel,
    });
    const hiddenBy =
      (
        await this.repo.archivers([
          {
            type: "madrasah",
            id: madrasahId,
            archivedBy: hide.archivedBy,
            koskId: null,
            madrasahId,
            courseId: null,
          },
        ])
      ).get(`madrasah:${madrasahId}`) ?? null;
    return {
      hidden: true,
      hiddenAt: hide.archivedAt,
      hiddenLevel,
      hiddenBy,
      canRestore: await mayRestoreHidden(
        this.authz,
        user,
        { entity: ENTITIES.MADRASAH, id: madrasahId },
        MADRASAH_HIDE_LADDER,
        hiddenLevel
      ),
    };
  }

  /**
   * One course's archive: the weeks and sessions of it that are hidden, for
   * the course team (`week.hide`, on the route), `types` narrowing what is
   * listed. `counts` are the tabs' numbers. Each says whether the caller may
   * bring it back.
   */
  async listForCourse(
    user: AuthenticatedUser,
    courseId: string,
    query: { types?: ArchiveItemType[]; page: number; limit: number }
  ): Promise<ICourseArchivePage> {
    const types = query.types
      ? COURSE_ARCHIVE_ITEM_TYPES.filter((t) => query.types?.includes(t))
      : COURSE_ARCHIVE_ITEM_TYPES;
    const filter = { courseId };
    const [page, counted] = await Promise.all([
      // Asked only for types a course's archive does not hold: nothing to read.
      types.length === 0
        ? { items: [], total: 0, page: query.page, limit: query.limit }
        : this.page(filter, types, query.page, query.limit),
      this.repo.countByType({ ...filter, types: COURSE_ARCHIVE_ITEM_TYPES }),
    ]);
    const count = (type: ArchiveItemType) => counted.get(type) ?? 0;
    return {
      ...(await this.restorable(user, page)),
      counts: {
        all: count("week") + count("session"),
        week: count("week"),
        session: count("session"),
      },
    };
  }

  /** The whole platform's archive. The başnazım's alone. */
  async listForPlatform(
    user: AuthenticatedUser,
    query: {
      koskId?: string;
      madrasahId?: string;
      type?: ArchiveItemType;
      q?: string;
      page: number;
      limit: number;
    }
  ): Promise<IRestorablePage> {
    this.assertChiefNazim(user);
    return this.restorable(
      user,
      await this.page(
        {
          koskId: query.koskId,
          madrasahId: query.madrasahId,
          type: query.type,
          q: query.q,
        },
        undefined,
        query.page,
        query.limit
      )
    );
  }

  async scopes(user: AuthenticatedUser): Promise<IArchiveScopes> {
    this.assertChiefNazim(user);
    return this.repo.scopes();
  }

  async restore(
    user: AuthenticatedUser,
    type: ArchiveItemType,
    id: string
  ): Promise<{ type: ArchiveItemType; id: string; title: string }> {
    const item = await this.requireItem(type, id);
    const level = await this.assertMayRestore(user, item);
    const outcome = await this.repo.restore(item, { id: user.sub, level });
    if (outcome.status === "not-found") {
      throw new ArchiveItemNotFoundError(type, id);
    }
    if (outcome.status === "parent-hidden") {
      throw new ArchiveParentHiddenError(type, id);
    }
    return { type, id, title: outcome.title };
  }

  /** What a real delete would take with it, for the confirmation. */
  async impact(
    user: AuthenticatedUser,
    type: ArchiveItemType,
    id: string
  ): Promise<IArchiveImpact> {
    this.assertChiefNazim(user);
    const impact = await this.repo.impact(type, id);
    if (!impact) throw new ArchiveItemNotFoundError(type, id);
    return impact;
  }

  /** Deletes a hidden item for real; the audit entry carries the caller's name. */
  async delete(
    user: AuthenticatedUser,
    type: ArchiveItemType,
    id: string
  ): Promise<void> {
    this.assertChiefNazim(user);
    await this.requireItem(type, id);
    const name = await this.repo.displayName(user.sub);
    if (!(await this.repo.purge(type, id, { id: user.sub, name }))) {
      throw new ArchiveItemNotFoundError(type, id);
    }
  }

  private async page(
    filter: IArchiveFilter,
    types: readonly ArchiveItemType[] | undefined,
    page: number,
    limit: number
  ): Promise<IArchivePage> {
    const scoped = { ...filter, ...(types ? { types } : {}) };
    const [rows, total] = await Promise.all([
      this.repo.list(scoped, limit, (page - 1) * limit),
      this.repo.count(scoped),
    ]);
    const archivers = await this.repo.archivers(rows);
    return {
      items: rows.map((row) => ({
        ...row,
        archiver: archivers.get(`${row.type}:${row.id}`) ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  private async requireItem(
    type: ArchiveItemType,
    id: string
  ): Promise<IArchiveItem> {
    const item = await this.repo.findOne(type, id);
    if (!item) throw new ArchiveItemNotFoundError(type, id);
    return item;
  }

  /**
   * Who may bring an item back: whoever holds a code of its ladder
   * (`hide-codes.ts`) on it, the başnazım always, and then only by the kademe
   * rule: the level that hid it or one above (`ArchiveRestoreLevelError` names
   * both levels otherwise). An item hidden before the level was recorded counts
   * as hidden at the lowest level that could have hidden it. Returns the level
   * the caller acts at.
   */
  private async assertMayRestore(
    user: AuthenticatedUser,
    item: IArchiveItem
  ): Promise<HideLevel> {
    const route = await this.restoreRoute(user, item, (_key, ask) => ask());
    if (route === null) throw new ArchiveForbiddenError();
    const hiddenAt = hiderLevelOf(item);
    if (!mayRestoreAt(route, hiddenAt)) {
      throw new ArchiveRestoreLevelError(hiddenAt, route);
    }
    return route;
  }

  /** Each entry with whether the caller may bring it back; one engine read per course, köşk or deck's köşk on the page. */
  private async restorable(
    user: AuthenticatedUser,
    page: IArchivePage
  ): Promise<IRestorablePage> {
    const memo = new Map<string, Promise<RestoreRoute>>();
    const once = (key: string, ask: () => Promise<RestoreRoute>) => {
      const known = memo.get(key);
      if (known) return known;
      const answer = ask();
      memo.set(key, answer);
      return answer;
    };
    const items = await Promise.all(
      page.items.map(async (entry) => {
        const route = await this.restoreRoute(user, entry, once);
        return {
          ...entry,
          canRestore:
            route !== null && mayRestoreAt(route, hiderLevelOf(entry)),
        };
      })
    );
    return { ...page, items };
  }

  private async restoreRoute(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: (
      key: string,
      ask: () => Promise<RestoreRoute>
    ) => Promise<RestoreRoute>
  ): Promise<RestoreRoute> {
    const target = hideTargetOf(item);
    if (target === null) {
      return this.authz.isSystemAdmin(user) ? SCOPE_TYPES.PLATFORM : null;
    }
    return once(target.key, () =>
      actingLevel(this.authz, user, target.resource, target.ladder, null)
    );
  }

  private assertChiefNazim(user: AuthenticatedUser): void {
    if (!this.authz.isSystemAdmin(user)) {
      throw new ArchiveForbiddenError(
        "Only the Medaris başnazımı may use the platform archive"
      );
    }
  }
}
