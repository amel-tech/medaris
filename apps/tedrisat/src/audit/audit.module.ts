import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { AuditController } from "./audit.controller";
import { AuditRepository } from "./audit.repository";
import { AuditService } from "./audit.service";

/** The audit trail and its reader (MDRS-181, nizam/17). `AuditService.record()` is what other modules call to write. */
@Module({
  imports: [AuthGuardModule, DatabaseModule, PlatformAccessModule],
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
