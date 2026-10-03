import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { NotificationModule } from "../notification/notification.module";
import { PlatformAccessModule } from "../platform-access/platform-access.service";
import { KoskApplicationController } from "./kosk-application.controller";
import { KoskApplicationService } from "./kosk-application.service";
import { KoskApplicationReviewRepository } from "./kosk-application-review.repository";
import { KoskApplicationReviewService } from "./kosk-application-review.service";
import { NizamKoskApplicationsController } from "./nizam-kosk-applications.controller";

@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    NotificationModule,
    PlatformAccessModule,
  ],
  controllers: [KoskApplicationController, NizamKoskApplicationsController],
  providers: [
    KoskApplicationService,
    KoskApplicationReviewService,
    KoskApplicationReviewRepository,
  ],
})
export class KoskApplicationModule {}
