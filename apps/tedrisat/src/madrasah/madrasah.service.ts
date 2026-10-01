import { Injectable } from "@nestjs/common";
import { IKoskWithStats } from "../kosk/kosk.repository.interface";
import { KoskService } from "../kosk/kosk.service";
import { MadrasahHandleTakenError } from "./errors/madrasah-handle-taken.error";
import { MadrasahNotFoundError } from "./errors/madrasah-not-found.error";
import { NazirNotFoundError } from "./errors/nazir-not-found.error";
import { MadrasahRepository } from "./madrasah.repository";
import {
  ICreateMadrasah,
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
  constructor(
    private readonly madrasahRepo: MadrasahRepository,
    private readonly koskService: KoskService
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

  async exists(id: string): Promise<boolean> {
    return this.madrasahRepo.exists(id);
  }

  /** True if `userId` is listed as a nazır of the medrese. */
  async isNazir(madrasahId: string, userId: string): Promise<boolean> {
    return this.madrasahRepo.isNazir(madrasahId, userId);
  }

  /** True if `userId` is a nazır of the medrese the köşk is affiliated with. */
  async isNazirOfKosk(koskId: string, userId: string): Promise<boolean> {
    return this.madrasahRepo.isNazirOfKosk(koskId, userId);
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

  /** Idempotent: inviting an existing nazır again changes nothing. */
  async addNazir(
    madrasahId: string,
    userId: string
  ): Promise<IMadrasahWithNazirs> {
    await this.madrasahRepo.addNazir(madrasahId, userId);
    return this.findById(madrasahId);
  }

  async removeNazir(
    madrasahId: string,
    userId: string
  ): Promise<IMadrasahWithNazirs> {
    if (!(await this.madrasahRepo.removeNazir(madrasahId, userId))) {
      throw new NazirNotFoundError(madrasahId, userId);
    }
    return this.findById(madrasahId);
  }

  /** Returns the köşk as `userId` now sees it, medrese included. */
  async affiliateKosk(
    madrasahId: string,
    koskId: string,
    userId: string
  ): Promise<IKoskWithStats> {
    await this.koskService.affiliate(koskId, madrasahId);
    return this.koskService.findById(koskId, userId);
  }

  async detachKosk(
    madrasahId: string,
    koskId: string,
    userId: string
  ): Promise<IKoskWithStats> {
    await this.koskService.detach(koskId, madrasahId);
    return this.koskService.findById(koskId, userId);
  }
}
