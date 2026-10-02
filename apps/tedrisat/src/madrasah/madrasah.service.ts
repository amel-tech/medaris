import { Injectable } from "@nestjs/common";
import { MadrasahAlreadyHiddenError } from "./errors/madrasah-already-hidden.error";
import { MadrasahHandleTakenError } from "./errors/madrasah-handle-taken.error";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { MadrasahNotHiddenError } from "./errors/madrasah-not-hidden.error";
import { MadrasahRepository } from "./madrasah.repository";
import {
  ICreateMadrasah,
  IMadrasahBadgeCounts,
  IMadrasahCourseFilter,
  IMadrasahCourseListItem,
  IMadrasahDirectory,
  IMadrasahDirectoryFilter,
  IMadrasahDirectoryItem,
  IMadrasahExplore,
  IMadrasahExploreFilter,
  IMadrasahOverview,
  IMadrasahSettings,
  IMadrasahWithNazirs,
  IPaginatedMadrasahs,
  IUpdateMadrasah,
  IUpdateMadrasahSettings,
} from "./madrasah.repository.interface";
import { firstFreeHandle, handleFromName } from "./madrasah-handle";

const UNIQUE_VIOLATION = "23505";

/** Postgres' unique-violation code, wherever drizzle put the driver error. */
function isUniqueViolation(error: unknown): boolean {
  const codeOf = (e: unknown): unknown =>
    typeof e === "object" && e !== null && "code" in e
      ? (e as { code: unknown }).code
      : undefined;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause: unknown }).cause
      : undefined;
  return (
    codeOf(error) === UNIQUE_VIOLATION || codeOf(cause) === UNIQUE_VIOLATION
  );
}

/**
 * The medrese layer (MDRS-106, ADR-003). Every method here is reached through
 * `MadrasahController`, whose `@Authz` scopes decide who may call it; nothing
 * here re-checks the caller's role.
 */
@Injectable()
export class MadrasahService {
  constructor(private readonly madrasahRepo: MadrasahRepository) {}

  async findAll(page: number, limit: number): Promise<IPaginatedMadrasahs> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.madrasahRepo.findAll(limit, offset),
      this.madrasahRepo.count(),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: string): Promise<IMadrasahWithNazirs> {
    const madrasah = await this.madrasahRepo.findById(id);
    if (!madrasah) throw new MadrasahNotFoundError(id);
    return madrasah;
  }

  /** The medrese page's data (MDRS-157); not-found for an unknown medrese. */
  async findOverview(
    id: string,
    userId: string | null
  ): Promise<IMadrasahOverview> {
    // A hidden medrese's page is closed like its listing (MDRS-170).
    if (
      !(await this.madrasahRepo.exists(id)) ||
      (await this.madrasahRepo.isHidden(id))
    ) {
      throw new MadrasahNotFoundError(id);
    }
    return this.madrasahRepo.findOverview(id, userId);
  }

  /** The nazır portal's menu badges (MDRS-183); not-found for an unknown medrese. */
  async getBadgeCounts(id: string): Promise<IMadrasahBadgeCounts> {
    if (!(await this.madrasahRepo.exists(id))) {
      throw new MadrasahNotFoundError(id);
    }
    return this.madrasahRepo.getBadgeCounts(id);
  }

  /** The medrese cards of Keşfet (MDRS-159). */
  async findExplore(
    filter: IMadrasahExploreFilter
  ): Promise<IMadrasahExplore[]> {
    return this.madrasahRepo.findExplore(filter);
  }

  async exists(id: string): Promise<boolean> {
    return this.madrasahRepo.exists(id);
  }

  /** True if `userId` is a nazır (MEDRESE_BASMUDERRIS) of the medrese. */
  async isNazir(madrasahId: string, userId: string): Promise<boolean> {
    return this.madrasahRepo.isNazir(madrasahId, userId);
  }

  async create(input: ICreateMadrasah): Promise<IMadrasahWithNazirs> {
    if (await this.madrasahRepo.handleTaken(input.handle)) {
      throw new MadrasahHandleTakenError(input.handle);
    }
    try {
      const created = await this.madrasahRepo.create(input);
      return this.findById(created.id);
    } catch (error) {
      // Two creates racing past the check above: the unique index decides.
      if (isUniqueViolation(error)) {
        throw new MadrasahHandleTakenError(input.handle);
      }
      throw error;
    }
  }

  /**
   * Opens a medrese with its başmüderris (MDRS-170). A handle the caller
   * chose is theirs to get right (409 when taken); one made from the name
   * takes the first free `name`, `name-2`, … so the form never fails on a
   * name two medreses share.
   */
  async open(
    input: Omit<ICreateMadrasah, "handle"> & {
      handle?: string;
      headMuderrisUserId: string;
    }
  ): Promise<IMadrasahWithNazirs> {
    const explicit = input.handle;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const handle =
        explicit ??
        (await firstFreeHandle(handleFromName(input.name), (h) =>
          this.madrasahRepo.handleTaken(h)
        ));
      if (explicit && (await this.madrasahRepo.handleTaken(handle))) {
        throw new MadrasahHandleTakenError(handle);
      }
      try {
        const created = await this.madrasahRepo.createWithHead(
          { ...input, handle },
          input.createdBy
        );
        return this.findById(created.id);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Two creates racing past the check above: the unique index decides.
        if (explicit) throw new MadrasahHandleTakenError(handle);
      }
    }
    throw new MadrasahHandleTakenError(handleFromName(input.name));
  }

  /** nizam/07's table: a page, the tabs' counts and the passive medreses the warning names. */
  async directory(
    filter: IMadrasahDirectoryFilter,
    page: number,
    limit: number
  ): Promise<IMadrasahDirectory> {
    const [{ items, total }, counts, passive] = await Promise.all([
      this.madrasahRepo.findDirectory(filter, limit, (page - 1) * limit),
      this.madrasahRepo.statusCounts(),
      this.madrasahRepo.findPassive(),
    ]);
    return { items, total, page, limit, counts, passive };
  }

  /** Makes `userId` the medrese's başmüderris; a passive medrese is active again. */
  async setHeadMuderris(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<IMadrasahDirectoryItem> {
    if (
      !(await this.madrasahRepo.setHeadMuderris(madrasahId, userId, actorId))
    ) {
      throw new MadrasahNotFoundError(madrasahId);
    }
    return this.directoryItem(madrasahId);
  }

  /** "Medreseyi gizle" (nazir/12): out of every list, its courses with it; nothing is deleted. */
  async hide(
    madrasahId: string,
    actorId: string
  ): Promise<IMadrasahDirectoryItem> {
    const result = await this.madrasahRepo.hide(madrasahId, actorId);
    if (result === "not-found") throw new MadrasahNotFoundError(madrasahId);
    if (result === "already-hidden") {
      throw new MadrasahAlreadyHiddenError(madrasahId);
    }
    return this.directoryItem(madrasahId);
  }

  /** "Geri al": a hidden medrese is listed again. */
  async restore(
    madrasahId: string,
    actorId: string
  ): Promise<IMadrasahDirectoryItem> {
    const result = await this.madrasahRepo.restore(madrasahId, actorId);
    if (result === "not-found") throw new MadrasahNotFoundError(madrasahId);
    if (result === "not-hidden") throw new MadrasahNotHiddenError(madrasahId);
    return this.directoryItem(madrasahId);
  }

  private async directoryItem(id: string): Promise<IMadrasahDirectoryItem> {
    const item = await this.madrasahRepo.findDirectoryItem(id);
    if (!item) throw new MadrasahNotFoundError(id);
    return item;
  }

  async update(
    id: string,
    updates: IUpdateMadrasah
  ): Promise<IMadrasahWithNazirs> {
    if (
      updates.handle !== undefined &&
      (await this.madrasahRepo.handleTaken(updates.handle, id))
    ) {
      throw new MadrasahHandleTakenError(updates.handle);
    }
    try {
      if (!(await this.madrasahRepo.update(id, updates))) {
        throw new MadrasahNotFoundError(id);
      }
    } catch (error) {
      if (isUniqueViolation(error) && updates.handle !== undefined) {
        throw new MadrasahHandleTakenError(updates.handle);
      }
      throw error;
    }
    return this.findById(id);
  }

  /** nazir/04's form; not-found for an unknown medrese. */
  async getSettings(id: string): Promise<IMadrasahSettings> {
    const settings = await this.madrasahRepo.getSettings(id);
    if (!settings) throw new MadrasahNotFoundError(id);
    return settings;
  }

  /** Saves nazir/04 (audited, stamped) and answers the screen's read again. */
  async updateSettings(
    id: string,
    patch: IUpdateMadrasahSettings,
    actorId: string
  ): Promise<IMadrasahSettings> {
    if (!(await this.madrasahRepo.updateSettings(id, patch, actorId))) {
      throw new MadrasahNotFoundError(id);
    }
    return this.getSettings(id);
  }

  /** The courses nazir/04 and nazir/07 list; not-found for an unknown medrese. */
  async findCourseList(
    id: string,
    filter: IMadrasahCourseFilter = {}
  ): Promise<IMadrasahCourseListItem[]> {
    if (!(await this.madrasahRepo.exists(id))) {
      throw new MadrasahNotFoundError(id);
    }
    return this.madrasahRepo.findCourseList(id, filter);
  }

  async delete(id: string): Promise<boolean> {
    if (!(await this.madrasahRepo.delete(id))) {
      throw new MadrasahNotFoundError(id);
    }
    return true;
  }
}
