import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../assignment/assignment.module";
import { BanModule } from "../ban/ban.module";
import { BunnyStreamModule } from "../bunny-stream/bunny-stream.module";
import { DatabaseService } from "../database/database.service";
import { KoskModule } from "../kosk/kosk.module";
import { LessonInvitationModule } from "../lesson-invitation/lesson-invitation.module";
import { NotificationModule } from "../notification/notification.module";
import { PlatformPolicyModule } from "../platform-policy/platform-policy.module";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { CourseAccessService } from "./course-access.service";
import { CourseNotificationRepository } from "./course-notification.repository";
import { CourseNotifier } from "./course-notifier";
import { CourseStatsRepository } from "./course-stats.repository";
import { LessonController } from "./lesson.controller";
import { LiveStreamController } from "./live-stream.controller";
import { LiveStreamService } from "./live-stream.service";
import { RecordingRepository } from "./recording.repository";
import { RecordingEncodingPoller } from "./recording-encoding.poller";
import { RecordingUploadController } from "./recording-upload.controller";
import { RecordingUploadService } from "./recording-upload.service";

@Module({
  imports: [
    AuthGuardModule,
    KoskModule,
    BanModule,
    PlatformPolicyModule,
    NotificationModule,
    AssignmentModule,
    BunnyStreamModule,
    LessonInvitationModule,
  ],
  controllers: [
    CourseController,
    LessonController,
    LiveStreamController,
    RecordingUploadController,
  ],
  providers: [
    CourseService,
    CourseRepository,
    CourseAccessService,
    LiveStreamService,
    RecordingRepository,
    RecordingUploadService,
    RecordingEncodingPoller,
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
