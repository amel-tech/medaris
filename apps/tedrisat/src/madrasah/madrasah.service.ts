import { Injectable, Logger } from "@nestjs/common";
import { GrantExpiryInvalidError } from "../assignment/admin/errors";
import { checkGrantExpiry } from "../assignment/admin/grant-plan";
import { KeycloakAdminService } from "../keycloak-admin/keycloak-admin.service";
import type { HeadDelegationResponse } from "./dto/set-head-muderris.dto";
import { MadrasahHandleTakenError } from "./errors/madrasah-handle-taken.error";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { MadrasahNotHiddenError } from "./errors/madrasah-not-hidden.error";
import { NazirNotFoundError } from "./errors/nazir-not-found.error";
import { MadrasahRepository } from "./madrasah.repository";
import {
  ICreateMadrasah,
  IMadrasahDirectory,
  IMadrasahDirectoryFilter,
  IMadrasahDirectoryItem,
  IMadrasahExplore,
  IMadrasahExploreFilter,
  IMadrasahOverview,
  IMadrasahWithNazirs,
  IPaginatedMadrasahs,
  IUpdateMadrasah,
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
  private readonly logger = new Logger(MadrasahService.name);

  // Must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly madrasahRepo: MadrasahRepository,
    private readonly keycloak: KeycloakAdminService
  ) {}

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

  /**
   * What `GET /madrasahs/:id` serves, to callers with no token too: a hidden
   * medrese is not-found, closed like its listing and its page (MDRS-170).
   * `findById` stays open to it for the writes that return the medrese they
   * changed.
   */
  async findOpenById(id: string): Promise<IMadrasahWithNazirs> {
    const madrasah = await this.findById(id);
    if (madrasah.archivedAt) throw new MadrasahNotFoundError(id);
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

  /**
   * Makes `userId` the medrese's başmüderris; a passive medrese is active
   * again. `options.decisions` answers what the outgoing başmüderris handed on
   * (nizam/22), `options.endsAt` is the new one's "Görev bitişi".
   */
  async setHeadMuderris(
    madrasahId: string,
    userId: string,
    actorId: string,
    options: {
      endsAt?: Date | null;
      decisions?: Array<{
        kind: "ROLE" | "GRANT";
        id: string;
        action: "TAKE_OVER" | "DROP";
      }>;
    } = {}
  ): Promise<IMadrasahDirectoryItem> {
    if (checkGrantExpiry(options.endsAt ?? null, null, new Date()) === "past") {
      throw new GrantExpiryInvalidError("The end date is in the past");
    }
    if (
      !(await this.madrasahRepo.setHeadMuderris(
        madrasahId,
        userId,
        actorId,
        options
      ))
    ) {
      throw new MadrasahNotFoundError(madrasahId);
    }
    return this.directoryItem(madrasahId);
  }

  /**
   * What the sitting başmüderris handed on (nizam/22's "şu kişilere rol ve
   * izin vermişti"), named. `exceptUserId` is the person about to take over.
   */
  async headDelegations(
    madrasahId: string,
    exceptUserId?: string
  ): Promise<HeadDelegationResponse[]> {
    if (!(await this.madrasahRepo.exists(madrasahId))) {
      throw new MadrasahNotFoundError(madrasahId);
    }
    const rows = await this.madrasahRepo.headDelegations(
      madrasahId,
      exceptUserId
    );
    const ids = [...new Set(rows.map((r) => r.userId))];
    const people = await this.madrasahRepo.people(ids);
    const missing = ids.filter((id) => !people.has(id));
    if (missing.length > 0 && this.keycloak.isConfigured()) {
      const found = await Promise.allSettled(
        missing.map((id) => this.keycloak.findById(id))
      );
      found.forEach((result, i) => {
        if (result.status === "fulfilled" && result.value) {
          people.set(missing[i], result.value);
        } else if (result.status === "rejected") {
          this.logger.warn(`No directory name for ${missing[i]}`);
        }
      });
    }
    return rows.map((r) => {
      const person = people.get(r.userId);
      const name = [person?.givenName, person?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        kind: r.kind,
        id: r.id,
        role: r.role,
        permission: r.permission,
        groupName: r.groupName,
        to: { id: r.userId, name: name || null, email: person?.email ?? null },
        grantedAt: r.grantedAt,
        expiresAt: r.expiresAt,
      };
    });
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

  async delete(id: string): Promise<boolean> {
    if (!(await this.madrasahRepo.delete(id))) {
      throw new MadrasahNotFoundError(id);
    }
    return true;
  }

  /**
   * Idempotent: inviting an existing nazır again changes nothing. `actorId`
   * is recorded as the granter.
   */
  async addNazir(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<IMadrasahWithNazirs> {
    if (!(await this.madrasahRepo.addNazir(madrasahId, userId, actorId))) {
      throw new MadrasahNotFoundError(madrasahId);
    }
    return this.findById(madrasahId);
  }

  async removeNazir(
    madrasahId: string,
    userId: string,
    actorId: string
  ): Promise<IMadrasahWithNazirs> {
    if (!(await this.madrasahRepo.removeNazir(madrasahId, userId, actorId))) {
      throw new NazirNotFoundError(madrasahId, userId);
    }
    return this.findById(madrasahId);
  }
}
