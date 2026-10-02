import { Injectable } from "@nestjs/common";
import type { CoursesAction } from "./dto/hosting-right.dto";
import {
  type GrantedByRole,
  HostingRepository,
  type IHostingRight,
} from "./hosting.repository";

/**
 * A köşk's hosting rights (MDRS-170, nizam/26 and nizam/27). Reached through
 * `HostingController`, whose `@Authz` decides who may call it: the köşk's
 * nazımları and SYSTEM_ADMIN. A right gives the medrese no power over the
 * köşk; it only lets the medrese open courses there.
 */
@Injectable()
export class HostingService {
  constructor(private readonly repo: HostingRepository) {}

  list(koskId: string): Promise<IHostingRight[]> {
    return this.repo.list(koskId);
  }

  /** Idempotent: a medrese that already holds the right gets the same answer. */
  async grant(
    koskId: string,
    madrasahId: string,
    actor: { id: string; role: GrantedByRole }
  ): Promise<IHostingRight> {
    await this.repo.grant(koskId, madrasahId, actor);
    const [right] = await this.repo.list(koskId, madrasahId);
    return right;
  }

  revoke(
    koskId: string,
    madrasahId: string,
    coursesAction: CoursesAction,
    actorId: string
  ): Promise<void> {
    return this.repo.revoke(koskId, madrasahId, coursesAction, actorId);
  }
}
