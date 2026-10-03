import { AuthenticatedUser, AuthzService } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
import { ArchiveRepository, IArchiver } from "./archive.repository";
import {
  ArchiveItemType,
  IArchiveFilter,
  IArchiveImpact,
  IArchiveItem,
  IArchiveScopes,
  KOSK_ARCHIVE_ITEM_TYPES,
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
    private readonly authz: AuthzService
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

  private async assertMayRestore(
    user: AuthenticatedUser,
    item: IArchiveItem
  ): Promise<void> {
    if (this.authz.isSystemAdmin(user)) return;
    if (
      KOSK_SCOPED.includes(item.type) &&
      item.koskId !== null &&
      (await this.koskService.isManager(item.koskId, user.sub))
    ) {
      return;
    }
    throw new ArchiveForbiddenError();
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
