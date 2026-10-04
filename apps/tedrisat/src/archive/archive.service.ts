import { AuthenticatedUser, AuthzService, ENTITIES } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { SCOPE_TYPES } from "../database/schema/scope-type.schema";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { KoskService } from "../kosk/kosk.service";
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
import {
  actingLevel,
  BARE_WEEK_HIDE_LADDER,
  COURSE_HIDE_LADDER,
  type HideLevel,
  hiderLevelOf,
  MADRASAH_HIDE_LADDER,
  mayRestoreAt,
  mayRestoreHidden,
  SECTION_HIDE_LADDER,
} from "./hide-level";

export interface IArchiveEntry extends IArchiveItem {
  archiver: IArchiver | null;
}

/** An entry with whether the caller may bring it back (Geri al). */
export interface IRestorableArchiveEntry extends IArchiveEntry {
  canRestore: boolean;
}

export interface IArchivePage<T extends IArchiveEntry = IArchiveEntry> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** What is restored by the level acting on its course: a course, and the weeks and sessions in one. */
const COURSE_SCOPED: readonly ArchiveItemType[] = ["course", "week", "session"];

export type IMadrasahArchiveEntry = IRestorableArchiveEntry;

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

export interface IMadrasahArchivePage
  extends IArchivePage<IMadrasahArchiveEntry> {
  madrasah: IMadrasahArchiveState;
  /** Everything hidden in the medrese, per type, whatever the page was asked for. */
  counts: Record<"all" | "course" | "week" | "session" | "recording", number>;
}

export interface ICourseArchivePage
  extends IArchivePage<IRestorableArchiveEntry> {
  /** Everything hidden in the course, per type, whatever the page was asked for. */
  counts: Record<"all" | "week" | "session", number>;
}

/**
 * The level the caller restores at, for an item, or null for no level at all.
 * A restore is by the level that hid the item or any above it (`mayRestoreAt`),
 * so the same row of the ladder that was recorded when it was hidden decides.
 */
type RestoreRoute = HideLevel | null;

/** One answer per key for a page of items: the engine is asked once per course or köşk. */
type Memo = <V>(key: string, ask: () => Promise<V>) => Promise<V>;

/**
 * The archive (MDRS-173): what nazımlar hid, listed, restored and, for the
 * Medaris başnazımı alone, deleted for real.
 *
 * Reading a köşk's, a medrese's or a course's archive is an `@Authz` on its
 * route. The platform-wide reads and the real delete are the başnazım's (the
 * service refuses anyone else). A restore asks the engine on the item's course
 * (`restoreRoute`), since which codes count depends on what the item is.
 * Anything else is `ArchiveForbiddenError`.
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

  /**
   * One köşk's archive: its courses, weeks, sessions and decks, never the köşk.
   * Reached through `@Authz(kosk.manage | platform.kosk_edit)` on the route.
   * Each item says whether the caller may bring it back: a köşk nazımı cannot
   * bring back what the platform hid (MDRS-108: no button leads to a 403).
   */
  async listForKosk(
    user: AuthenticatedUser,
    koskId: string,
    query: { type?: ArchiveItemType; q?: string; page: number; limit: number }
  ): Promise<IArchivePage<IRestorableArchiveEntry>> {
    if (!(await this.repo.koskExists(koskId))) {
      throw new KoskNotFoundError(koskId);
    }
    const page = await this.page(
      { koskId, type: query.type, q: query.q },
      KOSK_ARCHIVE_ITEM_TYPES,
      query.page,
      query.limit
    );
    return { ...page, items: await this.withCanRestore(user, page.items) };
  }

  /**
   * One medrese's archive (nazir/12): the hidden courses of the medrese and
   * the weeks and sessions in them, `types` narrowing what is listed. Reached
   * through `MadrasahArchiveController`, whose `@Authz` lets in whoever may
   * hide in the medrese or bring something back. Each item says whether the
   * caller may bring it back, and so does the medrese itself (`madrasah`).
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
    const items = await this.withCanRestore(user, page.items);
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

  /**
   * The medrese's own hide, for the banner nazir/12 shows: the page cannot read
   * a hidden medrese anywhere else it may not open. `canRestore` asks the ladder
   * `POST /madrasahs/:id/restore` asks, then the kademe.
   */
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
      ...page,
      items: await this.withCanRestore(user, page.items),
      counts: {
        all: count("week") + count("session"),
        week: count("week"),
        session: count("session"),
      },
    };
  }

  /** The whole platform's archive. The başnazım's alone, who brings back anything. */
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
  ): Promise<IArchivePage<IRestorableArchiveEntry>> {
    this.assertChiefNazim(user);
    const page = await this.page(
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
    return { ...page, items: await this.withCanRestore(user, page.items) };
  }

  async scopes(user: AuthenticatedUser): Promise<IArchiveScopes> {
    this.assertChiefNazim(user);
    return this.repo.scopes();
  }

  /**
   * Who may bring an item back: the başnazım, and for what sits in a köşk or a
   * medrese whoever acts there at some level (`restoreRoute`), then only by the
   * kademe rule: the level that hid it or one above (`ArchiveRestoreLevelError`
   * names both levels otherwise). The level is compared under the row lock, in
   * the repository's transaction.
   *
   * A course, a week and a session of a hidden köşk are closed to all but the
   * people above the köşk, so restoring one is a 404 to the rest, as the
   * course's own routes answer (MDRS-143).
   */
  async restore(
    user: AuthenticatedUser,
    type: ArchiveItemType,
    id: string
  ): Promise<{ type: ArchiveItemType; id: string; title: string }> {
    const item = await this.requireItem(type, id);
    if (COURSE_SCOPED.includes(item.type) && item.courseId !== null) {
      await this.authz.assertOpen(user, {
        entity: ENTITIES.COURSE,
        id: item.courseId,
      });
    }
    const ask: Memo = (_key, answer) => answer();
    // A week is asked on both of its ladders: whether its restore brings
    // sessions back is decided under the row lock, and the repository takes
    // the level that applies.
    const route = await this.restoreRoute(user, item, ask, "bare");
    if (route === null) throw new ArchiveForbiddenError();
    const sessionRoute =
      item.type === "week"
        ? await this.restoreRoute(user, item, ask, "section")
        : route;
    const outcome = await this.repo.restore(
      type,
      id,
      route,
      user.sub,
      sessionRoute
    );
    switch (outcome.status) {
      case "not-found":
        throw new ArchiveItemNotFoundError(type, id);
      case "forbidden":
        throw new ArchiveForbiddenError();
      case "level":
        throw new ArchiveRestoreLevelError(outcome.hiddenAt, route);
      case "parent-hidden":
        throw new ArchiveParentHiddenError(type, id);
      default:
        return { type, id, title: outcome.title };
    }
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
   * Whether the caller may bring the item back now: they act at some level
   * there and it was hidden at that level or below. An item hidden before the
   * level was recorded counts as hidden at the lowest level that could have
   * hidden it.
   */
  private async canRestore(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: Memo
  ): Promise<boolean> {
    const route = await this.restoreRoute(user, item, once);
    return route !== null && mayRestoreAt(route, hiderLevelOf(item));
  }

  /** Each page item with whether the caller may bring it back, one engine question per course or köşk. */
  private async withCanRestore<T extends IArchiveEntry>(
    user: AuthenticatedUser,
    entries: readonly T[]
  ): Promise<(T & { canRestore: boolean })[]> {
    const memo = new Map<string, Promise<unknown>>();
    const once: Memo = <V>(key: string, ask: () => Promise<V>) => {
      const known = memo.get(key) as Promise<V> | undefined;
      if (known) return known;
      const answer = ask();
      memo.set(key, answer);
      return answer;
    };
    return Promise.all(
      entries.map(async (entry) => ({
        ...entry,
        canRestore: await this.canRestore(user, entry, once),
      }))
    );
  }

  /**
   * The level the caller restores an item at. A course and the weeks and
   * sessions in it are decided by the engine on the course, on the same ladder
   * every course hide is recorded on (`COURSE_HIDE_LADDER`), so whoever could
   * hide at a level brings back at it: the köşk's nazımı, the başmüderris or a
   * nazır given `madrasah.course_hide`, platform management holding
   * `platform.course_hide`; a week or a session also at the course itself, by
   * whoever does its session work (`SECTION_HIDE_LADDER`), and a week that
   * brings no session back by its editor too (`BARE_WEEK_HIDE_LADDER`). A deck
   * is its köşk nazımı's, as its hide is. A köşk and a medrese are restored on
   * their own routes; here only the başnazım restores them.
   */
  private async restoreRoute(
    user: AuthenticatedUser,
    item: IArchiveItem,
    once: Memo,
    /** For a week: the ladder to ask, instead of the one its restore needs now. */
    weekLadder?: "bare" | "section"
  ): Promise<RestoreRoute> {
    if (this.authz.isSystemAdmin(user)) return SCOPE_TYPES.PLATFORM;
    if (COURSE_SCOPED.includes(item.type) && item.courseId !== null) {
      const courseId = item.courseId;
      // A week or a session also has the course's own rung: whoever runs the
      // course hid it there, and brings it back there. Bringing a session
      // back, alone or with its week, is session work; a week that brings
      // none back is the course's own text, as dropping it was.
      const name =
        item.type === "course"
          ? "course"
          : item.type === "session"
            ? "section"
            : (weekLadder ??
              ((await this.repo.weekRestoresSessions(item.id))
                ? "section"
                : "bare"));
      const ladder = {
        course: COURSE_HIDE_LADDER,
        section: SECTION_HIDE_LADDER,
        bare: BARE_WEEK_HIDE_LADDER,
      }[name];
      return once(`${name}:${courseId}`, () =>
        actingLevel(
          this.authz,
          user,
          { entity: ENTITIES.COURSE, id: courseId },
          ladder,
          null
        )
      );
    }
    if (
      item.type === "deck" &&
      item.koskId !== null &&
      (await once(`kosk:${item.koskId}`, () =>
        this.koskService.isManager(item.koskId as string, user.sub)
      ))
    ) {
      return SCOPE_TYPES.KOSK;
    }
    return null;
  }

  private assertChiefNazim(user: AuthenticatedUser): void {
    if (!this.authz.isSystemAdmin(user)) {
      throw new ArchiveForbiddenError(
        "Only the Medaris başnazımı may use the platform archive"
      );
    }
  }
}
