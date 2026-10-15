import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { IIntegrationPartner } from "../config/integration-partners-env";
import { PartnerRegistry } from "./partner-registry";
import { PartnerRegistryRepository } from "./partner-registry.repository";

/**
 * Carries `INTEGRATION_PARTNERS`, the registry before the başnazım kept it in
 * nizam, into the database, so a deployment that had a partner keeps it
 * working across the release that moved the registry. At boot, after the
 * migrations (`onApplicationBootstrap` runs once every module is initialised,
 * and before the server listens): each listed partner that is not registered
 * is registered, enabled, and bound to every köşk that already holds one of
 * its course codes. A partner registered already is not touched, so a
 * restart never undoes what the başnazım changed. The value is read for this
 * alone; once the table holds the partners it can be removed, which the log
 * says once per boot while it is set.
 */
@Injectable()
export class PartnerRegistrySeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(PartnerRegistrySeeder.name);

  // Value imports all: `import type` erases them from `design:paramtypes`
  // and Nest can no longer inject them.
  constructor(
    private readonly repo: PartnerRegistryRepository,
    private readonly registry: PartnerRegistry,
    private readonly config: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const partners =
      this.config.get<IIntegrationPartner[]>("integrations.seedPartners") ?? [];
    if (partners.length === 0) return;

    for (const partner of partners) {
      const seeded = await this.repo.seed(partner);
      if (seeded) {
        this.logger.log(
          `Registered the partner application ${partner.clientId} from INTEGRATION_PARTNERS, bound to ${seeded.kosks.length} köşk(s) that hold its course codes`
        );
      }
    }
    this.registry.invalidate();
    this.logger.warn(
      "INTEGRATION_PARTNERS is deprecated: the partner applications are kept in nizam (Ortak uygulamalar) now. It is read at boot only to register a listed partner that is not registered yet; every listed one is, so the value can be removed."
    );
  }
}
