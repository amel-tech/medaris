import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../assignment/assignment.module";
import { BanModule } from "../ban/ban.module";
import { DatabaseService } from "../database/database.service";
import { KoskModule } from "../kosk/kosk.module";
import { NotificationModule } from "../notification/notification.module";
import { PlatformPolicyModule } from "../platform-policy/platform-policy.module";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { CourseNotificationRepository } from "./course-notification.repository";
import { CourseNotifier } from "./course-notifier";
import { CourseStatsRepository } from "./course-stats.repository";
import { LessonController } from "./lesson.controller";
import { LiveStreamController } from "./live-stream.controller";
import { LiveStreamService } from "./live-stream.service";
import { RecordingController } from "./recording.controller";
import { RecordingRepository } from "./recording.repository";
import { RecordingService } from "./recording.service";

@Module({
  imports: [
    AuthGuardModule,
    KoskModule,
    BanModule,
    PlatformPolicyModule,
    NotificationModule,
    AssignmentModule,
  ],
  controllers: [
    CourseController,
    LessonController,
    LiveStreamController,
    RecordingController,
  ],
  providers: [
    CourseService,
    CourseRepository,
    LiveStreamService,
    RecordingRepository,
    RecordingService,
    CourseStatsRepository,
    CourseNotifier,
    CourseNotificationRepository,
    DatabaseService,
  ],
  // For AuthzBindingsModule's role resolver (MDRS-41): findKoskId,
  // isMuderris and findEnrollment have no CourseService counterpart, so the
  // repository is what is exported here.
  exports: [CourseRepository],
})
export class CourseModule {}
