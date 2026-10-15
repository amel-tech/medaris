import { AuthenticatedUser, loadJwtClaimPolicy } from "@medaris/common";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PERMISSIONS } from "../assignment/permission-catalog";
import { KoskNotFoundError } from "../kosk/errors/kosk-not-found.error";
import { PlatformAccessService } from "../platform-access/platform-access.service";
import type {
  PartnerAdminListResponse,
  PartnerAdminResponse,
} from "./dto/partner-admin.dto";
import {
  PartnerExistsError,
  PartnerFrontEndClientError,
  PartnerUnknownError,
} from "./errors/partner-errors";
import { PartnerRegistry } from "./partner-registry";
import { PartnerRegistryRepository } from "./partner-registry.repository";

/**
 * "Ortak uygulamalar" in nizam: the başnazım registers the partner
 * applications, renames them, disables and enables them, and binds each to
 * the köşks it works with. Under `platform.partner_manage`, which no role
 * holds by default: the başnazım has it by bypass, a Medaris nazımı only when
 * it is granted (`PlatformAccessService`, as the platform settings decide).
 *
 * Every write is one transaction with its audit rows, and empties the
 * registry's cache in this process (`PartnerRegistry.invalidate`), so the
 * change is in force on the next request here; another instance reads it
 * within the cache's minute. A partner is never deleted: disabling it refuses
 * its token, and its codes and links stay.
 */
@Injectable()
export class PartnerAdminService {
  private readonly frontEnds: readonly string[];

  // Value imports all: `import type` erases them from `design:paramtypes`
  // and Nest can no longer inject them.
  constructor(
    private readonly repo: PartnerRegistryRepository,
    private readonly registry: PartnerRegistry,
    private readonly access: PlatformAccessService,
    config: ConfigService
  ) {
    this.frontEnds = loadJwtClaimPolicy(config).allowedClients;
  }

  async list(user: AuthenticatedUser): Promise<PartnerAdminListResponse> {
    await this.access.assert(user, PERMISSIONS.PLATFORM_PARTNER_MANAGE);
    const [items, kosks] = await Promise.all([
      this.repo.listForAdmin(),
      this.repo.koskOptions(),
    ]);
    return { items, kosks };
  }

  /**
   * Registers a partner, enabled and bound to no köşk. A front-end's client
   * id is refused (409 `PARTNER_FRONT_END_CLIENT`): its people's tokens would
   * be refused everywhere but `/integrations/*`. So is one registered already
   * (409 `PARTNER_EXISTS`), enabled or not.
   */
  async create(
    user: AuthenticatedUser,
    partner: { clientId: string; name: string }
  ): Promise<PartnerAdminResponse> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_PARTNER_MANAGE
    );
    if (this.frontEnds.includes(partner.clientId)) {
      throw new PartnerFrontEndClientError(partner.clientId);
    }
    const added = await this.repo.create(
      { clientId: partner.clientId, name: partner.name.trim() },
      actorId
    );
    if (!added) throw new PartnerExistsError(partner.clientId);
    this.registry.invalidate();
    return this.one(partner.clientId);
  }

  /** Renames, disables or enables a partner; 404 `PARTNER_UNKNOWN` for an id not registered. */
  async update(
    user: AuthenticatedUser,
    clientId: string,
    change: { name?: string; enabled?: boolean }
  ): Promise<PartnerAdminResponse> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_PARTNER_MANAGE
    );
    const updated = await this.repo.update(
      clientId,
      { name: change.name?.trim(), enabled: change.enabled },
      actorId
    );
    if (!updated) throw new PartnerUnknownError();
    this.registry.invalidate();
    return this.one(clientId);
  }

  /**
   * Makes the partner's köşks exactly these (the köşk multi-select).
   * Unbinding a köşk takes the partner's codes off its courses, audited one
   * by one, and binding it again brings none back; what its registrations
   * already did stays, and their cancellations still reach the seats they
   * made.
   */
  async setKosks(
    user: AuthenticatedUser,
    clientId: string,
    koskIds: readonly string[]
  ): Promise<PartnerAdminResponse> {
    const actorId = await this.access.assert(
      user,
      PERMISSIONS.PLATFORM_PARTNER_MANAGE
    );
    const result = await this.repo.setKosks(clientId, koskIds, actorId);
    if (result.kind === "no-partner") throw new PartnerUnknownError();
    if (result.kind === "no-kosk") throw new KoskNotFoundError(result.koskId);
    this.registry.invalidate();
    return this.one(clientId);
  }

  private async one(clientId: string): Promise<PartnerAdminResponse> {
    const row = (await this.repo.listForAdmin()).find(
      (partner) => partner.clientId === clientId
    );
    if (!row) throw new PartnerUnknownError();
    return row;
  }
}
