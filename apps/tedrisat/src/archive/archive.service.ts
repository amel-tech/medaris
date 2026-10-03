import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { BAN_TIERS, type BanRole, mayLift, tierOfRole } from "../ban/ban-tier";
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
} from "./errors/archive-errors";

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
 * The kademe of whoever hid an item, as `tierOfRole` ranks roles. A hider who
 * holds no role where the item sits is the Medaris administration (the
 * SYSTEM_ADMIN realm role leaves no row), the highest; an item hidden before
 * hiders were recorded names nobody, the lowest, so anyone allowed to restore
 * it may.
 */
export function hiderTier(
  item: Pick<IArchiveItem, "archivedBy">,
  archiver: Pick<IArchiver, "role"> | null
): number {
  if (item.archivedBy === null) return BAN_TIERS.COURSE;
  return archiver?.role
    ? tierOfRole(archiver.role as BanRole)
    : BAN_TIERS.PLATFORM;
}

/**
 * How the caller reaches the restore of an item: "open" for the başnazım and
 * the item's köşk nazımı, who restore whatever sits there; "head" for the
 * item's medrese başmüderris, whose restore the kademe rule limits; null for
 * everyone else.
 */
type RestoreRoute = "open" | "head" | null;

/**
 * The archive (MDRS-173): what nazımlar hid, listed, restored and, for the
 * Medaris başnazımı alone, deleted for real.
 *
 * Authorization is here, not in `@Authz`: the matrix has no archive entity,
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
        canRestore: await this.canRestore(user, entry, entry.archiver, once),
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
   * The başnazım restores anything, a köşk nazımı what sits in their köşk, and
   * a medrese's başmüderris what sits in their medrese unless a higher kademe
   * hid it (nazir/12, "yalnız o kademe ya da üstü geri alabilir"). The kademe
   * rule is the medrese side's only: the köşk path was open before it and is
   * left as it was.
   */
  private async assertMayRestore(
    user: AuthenticatedUser,
    item: IArchiveItem
  ): Promise<void> {
    const route = await this.restoreRoute(user, item, (_key, ask) => ask());
    if (route === null) throw new ArchiveForbiddenError();
    if (route === "head") {
      const archiver =
        (await this.repo.archivers([item])).get(`${item.type}:${item.id}`) ??
        null;
      if (!mayLift(BAN_TIERS.MADRASAH, hiderTier(item, archiver))) {
        throw new ArchiveForbiddenError(
          "A higher kademe hid this; only that kademe or above brings it back"
        );
      }
    }
  }

  private async canRestore(
    user: AuthenticatedUser,
    item: IArchiveItem,
    archiver: IArchiver | null,
    once: (key: string, ask: () => Promise<boolean>) => Promise<boolean>
  ): Promise<boolean> {
    const route = await this.restoreRoute(user, item, once);
    return (
      route === "open" ||
      (route === "head" &&
        mayLift(BAN_TIERS.MADRASAH, hiderTier(item, archiver)))
    );
  }

  private async restoreRoute(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: (key: string, ask: () => Promise<boolean>) => Promise<boolean>
  ): Promise<RestoreRoute> {
    if (this.authz.isSystemAdmin(user)) return "open";
    if (
      KOSK_SCOPED.includes(item.type) &&
      item.koskId !== null &&
      (await once(`kosk:${item.koskId}`, () =>
        this.koskService.isManager(item.koskId as string, user.sub)
      ))
    ) {
      return "open";
    }
    if (
      MADRASAH_SCOPED.includes(item.type) &&
      item.madrasahId !== null &&
      (await once(`madrasah:${item.madrasahId}`, () =>
        this.madrasahService.isNazir(item.madrasahId as string, user.sub)
      ))
    ) {
      return "head";
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
