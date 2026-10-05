import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PassivationImpactRepository } from "./passivation-impact.repository";

/**
 * Measures what passivating a köşk or a medrese takes along (MDRS-227). Imported
 * by `KoskModule` and `MadrasahModule`; not by `InactiveScopeModule`, which
 * already imports `MadrasahModule`.
 */
@Module({
  imports: [DatabaseModule],
  providers: [PassivationImpactRepository],
  exports: [PassivationImpactRepository],
})
export class PassivationModule {}
