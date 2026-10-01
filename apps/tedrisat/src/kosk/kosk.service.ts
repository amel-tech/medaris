import { Injectable } from "@nestjs/common";
import { KoskAlreadyAffiliatedError } from "./errors/kosk-already-affiliated.error";
import { KoskForbiddenError } from "./errors/kosk-forbidden.error";
import { KoskNotAffiliatedError } from "./errors/kosk-not-affiliated.error";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { KoskRepository } from "./kosk.repository";
import {
  ICreateKosk,
  IKosk,
  IKoskRef,
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

  /** True if `userId` owns the köşk; false if not (incl. a missing köşk). */
  async isOwner(koskId: string, userId: string): Promise<boolean> {
    const ownerId = await this.koskRepo.findOwnerId(koskId);
    return ownerId !== null && ownerId === userId;
  }

  /** The köşks `userId` manages, by name — for the `GET /me` role summary. */
  async findManagedBy(userId: string): Promise<IKoskRef[]> {
    return this.koskRepo.findOwnedBy(userId);
  }

  /** True if `userId` manages at least one köşk. */
  async managesAny(userId: string): Promise<boolean> {
    return this.koskRepo.ownsAny(userId);
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

  /** True if a köşk with this id exists. */
  async exists(koskId: string): Promise<boolean> {
    return (await this.koskRepo.findOwnerId(koskId)) !== null;
  }

  /**
   * Authorization is `@Authz(SCOPES.EDIT, …)` on `KoskController.update`
   * (MDRS-106): the köşk's manager, or a nazır of its medrese. No ownership
   * assertion is repeated here, because it would refuse the nazır.
   */
  async update(id: string, updates: IUpdateKosk): Promise<IKosk> {
    const updated = await this.koskRepo.update(id, updates);
    if (!updated) {
      throw new KoskNotFoundError(id);
    }
    return updated;
  }

  /**
   * SYSTEM_ADMIN's delete (MDRS-124) — `@Authz(SCOPES.DELETE, …)` on the
   * controller, and DELETE is on no role row, so nobody else reaches this.
   * Removes the köşk's courses and everything under them explicitly and
   * writes an audit entry; see `KoskRepository.purge`.
   */
  async delete(id: string, actorId: string): Promise<boolean> {
    const removed = await this.koskRepo.purge(id, actorId);
    if (!removed) throw new KoskNotFoundError(id);
    return true;
  }

  /**
   * Affiliates the köşk with a medrese (MDRS-106). Idempotent for the same
   * medrese; a köşk that already belongs to another one is a 409 — it has to
   * be detached from there first.
   */
  async affiliate(koskId: string, madrasahId: string): Promise<void> {
    if (await this.koskRepo.affiliate(koskId, madrasahId)) return;
    if (!(await this.exists(koskId))) throw new KoskNotFoundError(koskId);
    throw new KoskAlreadyAffiliatedError(koskId, { madrasahId });
  }

  /** Detaches the köşk from `madrasahId`; 404 unless it belongs to it. */
  async detach(koskId: string, madrasahId: string): Promise<void> {
    if (await this.koskRepo.detach(koskId, madrasahId)) return;
    if (!(await this.exists(koskId))) throw new KoskNotFoundError(koskId);
    throw new KoskNotAffiliatedError(koskId, madrasahId);
  }

  /**
   * The köşk's own way out of a medrese: without it, a köşk a nazır had
   * affiliated could only be released by that medrese's nazırs.
   */
  async leaveMadrasah(koskId: string): Promise<void> {
    if (await this.koskRepo.leaveMadrasah(koskId)) return;
    if (!(await this.exists(koskId))) throw new KoskNotFoundError(koskId);
    throw new KoskNotAffiliatedError(koskId);
  }

  async follow(userId: string, koskId: string): Promise<boolean> {
    await this.findById(koskId, userId); // throws if köşk is missing
    return this.koskRepo.follow(userId, koskId);
  }

  async unfollow(userId: string, koskId: string): Promise<boolean> {
    return this.koskRepo.unfollow(userId, koskId);
  }
}
