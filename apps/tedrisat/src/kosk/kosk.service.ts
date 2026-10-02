import { Injectable } from "@nestjs/common";
import { KoskForbiddenError } from "./errors/kosk-forbidden.error";
import { KoskLastManagerError } from "./errors/kosk-last-manager.error";
import { KoskManagerNotFoundError } from "./errors/kosk-manager-not-found.error";
import { KoskManagerUnknownUserError } from "./errors/kosk-manager-unknown-user.error";
import { KoskNotFoundError } from "./errors/kosk-not-found.error";
import { KoskRepository } from "./kosk.repository";
import {
  ICreateKosk,
  IFollowedKoskCourse,
  IKosk,
  IKoskDecks,
  IKoskListFilter,
  IKoskRef,
  IKoskWithStats,
  IManagerActor,
  IPaginatedKosks,
  IUpdateKosk,
} from "./kosk.repository.interface";

@Injectable()
export class KoskService {
  constructor(private readonly koskRepo: KoskRepository) {}

  /**
   * A page of köşks. `managedByCaller` (`GET /kosks?managedBy=me`, MDRS-108)
   * narrows both the page and `total` to the köşks `userId` manages, so the
   * page count nizam derives from `total` matches what it lists. Without it
   * the page is the public listing, which never holds an unlisted köşk
   * (MDRS-122). `madrasahId` narrows to one medrese's köşks.
   *
   * `userId` null is a caller with no token (MDRS-122); the controller does
   * not let such a caller ask for `managedByCaller`.
   */
  async findAll(
    userId: string | null,
    page: number,
    limit: number,
    {
      managedByCaller = false,
      madrasahId,
      level,
      field,
      q,
    }: {
      managedByCaller?: boolean;
      madrasahId?: string;
      level?: string;
      field?: string;
      q?: string;
    } = {}
  ): Promise<IPaginatedKosks> {
    const offset = (page - 1) * limit;
    const filter: IKoskListFilter = {
      ...(managedByCaller && userId !== null ? { managerId: userId } : {}),
      ...(madrasahId !== undefined ? { madrasahId } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(field !== undefined ? { field } : {}),
      ...(q !== undefined && q.trim() !== "" ? { q: q.trim() } : {}),
    };
    const [items, total] = await Promise.all([
      this.koskRepo.findAll(userId, limit, offset, filter),
      this.koskRepo.count(filter),
    ]);
    return { items, total, page, limit };
  }

  /** The ilim alanı Keşfet offers as chips (MDRS-159). */
  async listFields(): Promise<string[]> {
    return this.koskRepo.listFields();
  }

  /** The köşk's decks for a caller who belongs to it (MDRS-159). */
  async findDecks(koskId: string, userId: string): Promise<IKoskDecks> {
    return this.koskRepo.findDecks(koskId, userId);
  }

  /** Courses of the köşks the caller follows, for Ana sayfa (MDRS-165). */
  async findFollowedCourses(
    userId: string,
    limit: number
  ): Promise<IFollowedKoskCourse[]> {
    return this.koskRepo.findFollowedCourses(userId, limit);
  }

  async findById(id: string, userId: string | null): Promise<IKoskWithStats> {
    const kosk = await this.koskRepo.findById(id, userId);
    if (!kosk) {
      throw new KoskNotFoundError(id);
    }
    return kosk;
  }

  /**
   * True if `userId` is one of the köşk's managers (MDRS-126) — holds
   * KOSK_NAZIM there (MDRS-134); false if not, including for a missing köşk. The one predicate
   * authorization and the domain code both read.
   */
  async isManager(koskId: string, userId: string): Promise<boolean> {
    return this.koskRepo.isManager(koskId, userId);
  }

  /** The köşks `userId` manages, by name — for the `GET /me` role summary. */
  async findManagedBy(userId: string): Promise<IKoskRef[]> {
    return this.koskRepo.findManagedBy(userId);
  }

  /** True if `userId` manages at least one köşk. */
  async managesAny(userId: string): Promise<boolean> {
    return this.koskRepo.managesAny(userId);
  }

  /** Ensures the köşk exists and `userId` manages it, else throws. */
  async assertManager(koskId: string, userId: string): Promise<void> {
    const [exists, isManager] = await Promise.all([
      this.koskRepo.exists(koskId),
      this.koskRepo.isManager(koskId, userId),
    ]);
    if (!exists) {
      throw new KoskNotFoundError(koskId);
    }
    if (!isManager) {
      throw new KoskForbiddenError();
    }
  }

  async create(newKosk: ICreateKosk): Promise<IKosk> {
    return this.koskRepo.create(newKosk);
  }

  /**
   * Whether the köşk is unlisted (`is_private`, MDRS-122), or null when there
   * is no such köşk. The anonymous resolver reads it to answer an unlisted
   * köşk with the same 404 as a missing one, and enrolment reads it because
   * every request to join a course of an unlisted köşk waits for approval.
   */
  async findVisibility(id: string): Promise<{ isPrivate: boolean } | null> {
    return this.koskRepo.findVisibility(id);
  }

  /** True if a köşk with this id exists. */
  async exists(koskId: string): Promise<boolean> {
    return this.koskRepo.exists(koskId);
  }

  /**
   * Makes `userId` a manager of the köşk (MDRS-126). Idempotent. The route's
   * `@Authz(SCOPES.MANAGE_KOSK_MANAGERS, byExistingKosk)` checks the actor
   * first; the repository checks again under the köşk lock. 404 when that
   * user has never signed in.
   */
  async addManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<void> {
    const outcome = await this.koskRepo.addManager(koskId, userId, actor);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "forbidden") throw new KoskForbiddenError();
    if (outcome === "unknown-user") {
      throw new KoskManagerUnknownUserError(userId);
    }
  }

  /**
   * Removes `userId` from the köşk's managers. 404 when they are not one,
   * 409 when they are the last one — a köşk is never left unmanaged.
   */
  async removeManager(
    koskId: string,
    userId: string,
    actor: IManagerActor
  ): Promise<void> {
    const outcome = await this.koskRepo.removeManager(koskId, userId, actor);
    if (outcome === "no-kosk") throw new KoskNotFoundError(koskId);
    if (outcome === "forbidden") throw new KoskForbiddenError();
    if (outcome === "not-manager") {
      throw new KoskManagerNotFoundError(koskId, userId);
    }
    if (outcome === "last") {
      throw new KoskLastManagerError(koskId, userId);
    }
  }

  /**
   * Authorization is `@Authz(SCOPES.EDIT, …)` on `KoskController.update`: the
   * köşk's managers. A medrese has no say over a köşk since MDRS-134.
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

  async follow(userId: string, koskId: string): Promise<boolean> {
    await this.findById(koskId, userId); // throws if köşk is missing
    return this.koskRepo.follow(userId, koskId);
  }

  async unfollow(userId: string, koskId: string): Promise<boolean> {
    return this.koskRepo.unfollow(userId, koskId);
  }
}
