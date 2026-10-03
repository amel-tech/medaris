import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { MadrasahService } from "../madrasah/madrasah.service";
import { ArchiveRepository, IArchiver } from "./archive.repository";
import {
  ArchiveItemType,
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
import { type HideLevel, hiderLevelOf, mayRestoreAt } from "./hide-level";

export interface IArchiveEntry extends IArchiveItem {
  archiver: IArchiver | null;
}

export interface IArchivePage {
  items: IArchiveEntry[];
  total: number;
  page: number;
  limit: number;
}

/** What a köşk manager may bring back: the contents of their own köşk. */
const KOSK_SCOPED: readonly ArchiveItemType[] = [
  "course",
  "week",
  "session",
  "deck",
];

/** What a medrese's başmüderris may bring back: the contents of their own medrese, by kademe. */
const MADRASAH_SCOPED: readonly ArchiveItemType[] = [
  "course",
  "week",
  "session",
];

export interface IMadrasahArchiveEntry extends IArchiveEntry {
  canRestore: boolean;
}

export interface IMadrasahArchivePage extends IArchivePage {
  items: IMadrasahArchiveEntry[];
  /** Everything hidden in the medrese, per type, whatever the page was asked for. */
  counts: Record<"all" | "course" | "week" | "session" | "recording", number>;
}

/**
 * The level the caller restores at, for an item: the başnazım is the platform,
 * the item's köşk nazımı the köşk, the item's medrese başmüderris the medrese,
 * and everyone else nothing (null). A restore is by the level that hid the item
 * or any above it (`mayRestoreAt`), so the same row of the ladder that was
 * recorded when it was hidden decides.
 */
type RestoreRoute = HideLevel | null;

/**
 * The archive (MDRS-173): what nazımlar hid, listed, restored and, for the
 * Medaris başnazımı alone, deleted for real.
 *
 * Authorization is here, not in `@Authz`: the engine has no archive entity,
 * and the question is the same everywhere — SYSTEM_ADMIN (the başnazım), or
 * for what sits in a köşk, a manager of that köşk. Anything else is
 * `ArchiveForbiddenError`.
 */
@Injectable()
export class ArchiveService {
  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ArchiveRepository,
    private readonly koskService: KoskService,
    private readonly authz: AuthzService,
    private readonly madrasahService: MadrasahService
  ) {}

  /** One köşk's archive: its courses, weeks, sessions and decks, never the köşk. */
  async listForKosk(
    user: AuthenticatedUser,
    koskId: string,
    query: { type?: ArchiveItemType; q?: string; page: number; limit: number }
  ): Promise<IArchivePage> {
    if (!(await this.repo.koskExists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    await this.assertKoskManager(user, koskId);
    return this.page(
      { koskId, type: query.type, q: query.q },
      KOSK_ARCHIVE_ITEM_TYPES,
      query.page,
      query.limit
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
    const memo = new Map<string, Promise<boolean>>();
    const once = (key: string, ask: () => Promise<boolean>) => {
      const known = memo.get(key);
      if (known) return known;
      const answer = ask();
      memo.set(key, answer);
      return answer;
    };
    const items = await Promise.all(
      page.items.map(async (entry) => ({
        ...entry,
        canRestore: await this.canRestore(user, entry, once),
      }))
    );
    const count = (type: ArchiveItemType) => counted.get(type) ?? 0;
    return {
      ...page,
      items,
      counts: {
        all: [...counted.values()].reduce((sum, n) => sum + n, 0),
        course: count("course"),
        week: count("week"),
        session: count("session"),
        recording: count("recording"),
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
  ): Promise<IArchivePage> {
    this.assertChiefNazim(user);
    return this.page(
      {
        koskId: query.koskId,
        madrasahId: query.madrasahId,
        type: query.type,
        q: query.q,
      },
      undefined,
      query.page,
      query.limit
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
    await this.assertMayRestore(user, item);
    const outcome = await this.repo.restore(type, id);
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
   * Who may bring an item back: the başnazım, a köşk nazımı for what sits in
   * their köşk, a medrese's başmüderris for what sits in their medrese, and
   * then only by the kademe rule: the level that hid it or one above
   * (`ArchiveRestoreLevelError` names both levels otherwise). An item hidden
   * before the level was recorded counts as hidden at the lowest level that
   * could have hidden it.
   */
  private async assertMayRestore(
    user: AuthenticatedUser,
    item: IArchiveItem
  ): Promise<void> {
    const route = await this.restoreRoute(user, item, (_key, ask) => ask());
    if (route === null) throw new ArchiveForbiddenError();
    const hiddenAt = hiderLevelOf(item);
    if (!mayRestoreAt(route, hiddenAt)) {
      throw new ArchiveRestoreLevelError(hiddenAt, route);
    }
  }

  private async canRestore(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: (key: string, ask: () => Promise<boolean>) => Promise<boolean>
  ): Promise<boolean> {
    const route = await this.restoreRoute(user, item, once);
    return route !== null && mayRestoreAt(route, hiderLevelOf(item));
  }

  private async restoreRoute(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: (key: string, ask: () => Promise<boolean>) => Promise<boolean>
  ): Promise<RestoreRoute> {
    if (this.authz.isSystemAdmin(user)) return SCOPE_TYPES.PLATFORM;
    if (
      KOSK_SCOPED.includes(item.type) &&
      item.koskId !== null &&
      (await once(`kosk:${item.koskId}`, () =>
        this.koskService.isManager(item.koskId as string, user.sub)
      ))
    ) {
      return SCOPE_TYPES.KOSK;
    }
    if (
      MADRASAH_SCOPED.includes(item.type) &&
      item.madrasahId !== null &&
      (await once(`madrasah:${item.madrasahId}`, () =>
        this.madrasahService.isNazir(item.madrasahId as string, user.sub)
      ))
    ) {
      return SCOPE_TYPES.MADRASAH;
    }
    return null;
  }

  private async assertKoskManager(
    user: AuthenticatedUser,
    koskId: string
  ): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;
    if (await this.koskService.isManager(koskId, user.sub)) return;
    throw new ArchiveForbiddenError("You are not a manager of this köşk");
  }

  private assertChiefNazim(user: AuthenticatedUser): void {
    if (!this.authz.isSystemAdmin(user)) {
      throw new ArchiveForbiddenError(
        "Only the Medaris başnazımı may use the platform archive"
      );
    }
  }
}
