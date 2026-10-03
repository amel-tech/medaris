import {
  AuthGuardModule,
  AuthzModule,
  LoggerModule,
  RateLimitModule,
} from "@medaris/common";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ArchiveModule } from "./archive/archive.module";
import { AssignmentModule } from "./assignment/assignment.module";
import { AuditModule } from "./audit/audit.module";
import { AuthzBindingsModule } from "./authz/authz-bindings.module";
import { BanModule } from "./ban/ban.module";
import { CalendarFeedModule } from "./calendar-feed/calendar-feed.module";
import { configuration } from "./config";
import { CourseModule } from "./course/course.module";
import { CourseRequestModule } from "./course-request/course-request.module";
import { DatabaseModule } from "./database/database.module";
import { DeckReviewModule } from "./deck-review/deck-review.module";
import { FlashcardModule } from "./flashcard/flashcard.module";
import { FlashcardLabelModule } from "./flashcard/flashcard-label.module";
import { HostingModule } from "./hosting/hosting.module";
import { InactiveScopeModule } from "./inactive-scope/inactive-scope.module";
import { KoskModule } from "./kosk/kosk.module";
import { KoskApplicationModule } from "./kosk-application/kosk-application.module";
import { MadrasahCourseModule } from "./madrasah/course/madrasah-course.module";
import { MadrasahModule } from "./madrasah/madrasah.module";
import { MadrasahNazirModule } from "./madrasah/nazir/madrasah-nazir.module";
import { MadrasahPortalModule } from "./madrasah/portal/madrasah-portal.module";
import { NizamDashboardModule } from "./nizam-dashboard/nizam-dashboard.module";
import { NotificationModule } from "./notification/notification.module";
import { PlatformPolicyModule } from "./platform-policy/platform-policy.module";
import { ScheduleModule } from "./schedule/schedule.module";
import { UserModule } from "./user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // No envFilePath: ./load-env.ts has already applied the single root
      // .env, with the app prefixes stripped. Pointing ConfigModule at a
      // file as well would re-add the prefixed keys and, worse, would read a
      // stale apps/<app>/.env if one were ever left behind.
    }),
    LoggerModule.forRoot(),
    RateLimitModule,
    AuthGuardModule,
    AuthzModule,
    AuthzBindingsModule,
    DatabaseModule,
    FlashcardModule,
    FlashcardLabelModule,
    KoskModule,
    MadrasahModule,
    HostingModule,
    CourseModule,
    CalendarFeedModule,
    KoskApplicationModule,
    NotificationModule,
    ScheduleModule,
    AssignmentModule,
    // After AssignmentModule: it imports it, and the exported API document
    // lists paths in the order the modules are scanned.
    MadrasahNazirModule,
    InactiveScopeModule,
    MadrasahCourseModule,
    MadrasahPortalModule,
    ArchiveModule,
    DeckReviewModule,
    AuditModule,
    PlatformPolicyModule,
    CourseRequestModule,
    BanModule,
    NizamDashboardModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
