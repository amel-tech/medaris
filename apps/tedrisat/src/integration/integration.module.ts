import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { BanModule } from "../ban/ban.module";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { LessonInvitationModule } from "../lesson-invitation/lesson-invitation.module";
import { PartnerRepository } from "./partner.repository";
import { PartnerCodesController } from "./partner-codes.controller";
import { PartnerCodesService } from "./partner-codes.service";
import { PartnerEnrollmentController } from "./partner-enrollment.controller";
import { PartnerEnrollmentService } from "./partner-enrollment.service";
import {
  buildPartnerThrottlerOptions,
  PARTNER_THROTTLER_OPTIONS,
} from "./partner-throttler.guard";

/**
 * Partner enrollments: a partner application's registrations become course
 * enrollments (`/integrations/*`, `PartnerEnrollmentController`), through the
 * codes course staff map in nazar (`PartnerCodesController`). The partners are
 * `INTEGRATION_PARTNERS`; with none, the partner routes answer 404.
 */
@Module({
  imports: [
    AuthGuardModule,
    DatabaseModule,
    CourseModule,
    BanModule,
    KeycloakAdminModule,
    LessonInvitationModule,
  ],
  controllers: [PartnerEnrollmentController, PartnerCodesController],
  providers: [
    PartnerRepository,
    PartnerEnrollmentService,
    PartnerCodesService,
    {
      provide: PARTNER_THROTTLER_OPTIONS,
      useFactory: buildPartnerThrottlerOptions,
    },
  ],
})
export class IntegrationModule {}
