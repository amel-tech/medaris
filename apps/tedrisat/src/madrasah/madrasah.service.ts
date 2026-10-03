import { Injectable } from "@nestjs/common";
import { MadrasahHandleTakenError } from "./errors/madrasah-handle-taken.error";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { NazirNotFoundError } from "./errors/nazir-not-found.error";
import { MadrasahRepository } from "./madrasah.repository";
import {
  ICreateMadrasah,
  IMadrasahOverview,
  IMadrasahWithNazirs,
  IPaginatedMadrasahs,
  IUpdateMadrasah,
} from "./madrasah.repository.interface";

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
    if (!(await this.madrasahRepo.exists(id))) {
      throw new MadrasahNotFoundError(id);
    }
    return this.madrasahRepo.findOverview(id, userId);
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
