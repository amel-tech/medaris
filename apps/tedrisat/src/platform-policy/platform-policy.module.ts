import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { PlatformPolicyController } from "./platform-policy.controller";
import { PlatformPolicyRepository } from "./platform-policy.repository";
import { PlatformPolicyService } from "./platform-policy.service";

/** The platform policies (MDRS-181): the settings page and the checks other modules make. */
@Module({
  imports: [AuthGuardModule, DatabaseModule, PlatformAccessModule],
  controllers: [PlatformPolicyController],
  providers: [PlatformPolicyService, PlatformPolicyRepository],
  exports: [PlatformPolicyService],
})
export class PlatformPolicyModule {}
