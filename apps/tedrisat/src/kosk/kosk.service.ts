import { Injectable } from "@nestjs/common";
import { KoskForbiddenError } from "./errors/kosk-forbidden.error";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { KoskRepository } from "./kosk.repository";
import {
  ICreateKosk,
  IKosk,
  IKoskWithStats,
  IPaginatedKosks,
  IUpdateKosk,
} from "./kosk.repository.interface";

@Injectable()
export class KoskService {
  constructor(private readonly koskRepo: KoskRepository) {}

  async findAll(
    userId: string,
    page: number,
    limit: number
  ): Promise<IPaginatedKosks> {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.koskRepo.findAll(userId, limit, offset),
      this.koskRepo.count(),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: string, userId: string): Promise<IKoskWithStats> {
    const kosk = await this.koskRepo.findById(id, userId);
    if (!kosk) {
      throw new KoskNotFoundError(id);
    }
    return kosk;
  }

  /**
   * The köşk's owner, or `null` when there is no such köşk.
   *
   * `isOwner` below answers the same read as a boolean and is the right
   * shape for most callers. `TedrisatRoleResolver` needs the third state:
   * "no such köşk" is a 404 and "not your köşk" is a 403, and a boolean
   * cannot tell them apart.
   */
  async findOwnerId(koskId: string): Promise<string | null> {
    return this.koskRepo.findOwnerId(koskId);
  }

  /** True if `userId` owns the köşk; false if not (incl. a missing köşk). */
  async isOwner(koskId: string, userId: string): Promise<boolean> {
    const ownerId = await this.koskRepo.findOwnerId(koskId);
    return ownerId !== null && ownerId === userId;
  }

  /** Ensures the köşk exists and is owned by `userId`, else throws. */
  async assertOwner(koskId: string, userId: string): Promise<void> {
    const ownerId = await this.koskRepo.findOwnerId(koskId);
    if (ownerId === null) {
      throw new KoskNotFoundError(koskId);
    }
    if (ownerId !== userId) {
      throw new KoskForbiddenError();
    }
  }

  async create(newKosk: ICreateKosk): Promise<IKosk> {
    return this.koskRepo.create(newKosk);
  }

  async update(
    id: string,
    userId: string,
    updates: IUpdateKosk
  ): Promise<IKosk> {
    await this.assertOwner(id, userId);
    const updated = await this.koskRepo.update(id, updates);
    if (!updated) {
      throw new KoskNotFoundError(id);
    }
    return updated;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    await this.assertOwner(id, userId);
    return this.koskRepo.delete(id);
  }

  async follow(userId: string, koskId: string): Promise<boolean> {
    await this.findById(koskId, userId); // throws if köşk is missing
    return this.koskRepo.follow(userId, koskId);
  }

  async unfollow(userId: string, koskId: string): Promise<boolean> {
    return this.koskRepo.unfollow(userId, koskId);
  }
}
