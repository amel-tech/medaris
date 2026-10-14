import { REFUSED_CLIENT_SOURCE } from "@medaris/common";
import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PartnerRegistry } from "./partner-registry";
import { PartnerRegistryRepository } from "./partner-registry.repository";
import { PartnerRegistrySeeder } from "./partner-registry.seeder";

/**
 * The partner registry (partner enrollments): the registered partner
 * applications, cached (`PartnerRegistry`), and the boot's seeding from
 * `INTEGRATION_PARTNERS`.
 *
 * Global for one reason: `REFUSED_CLIENT_SOURCE`. `AuthGuardModule` is imported
 * by most modules, and the `JwtVerifierService` it builds asks this registry
 * whether a token's client is a partner's; only a global module's export is
 * seen from inside it. It imports nothing that imports it back.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    PartnerRegistryRepository,
    PartnerRegistry,
    PartnerRegistrySeeder,
    { provide: REFUSED_CLIENT_SOURCE, useExisting: PartnerRegistry },
  ],
  exports: [PartnerRegistry, PartnerRegistryRepository, REFUSED_CLIENT_SOURCE],
})
export class PartnerRegistryModule {}
