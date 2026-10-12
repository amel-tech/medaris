import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { AssignmentModule } from "../assignment/assignment.module";
import { TedrisatAuthzContext } from "../authz/tedrisat-authz-context.service";
import { BanModule } from "../ban/ban.module";
import { BunnyStreamModule } from "../bunny-stream/bunny-stream.module";
import { DatabaseService } from "../database/database.service";
import { KeycloakAdminModule } from "../keycloak-admin/keycloak-admin.module";
import { KoskModule } from "../kosk/kosk.module";
import { LessonInvitationModule } from "../lesson-invitation/lesson-invitation.module";
import { NotificationModule } from "../notification/notification.module";
import { PlatformPolicyModule } from "../platform-policy/platform-policy.module";
import { StorageModule } from "../storage/storage.module";
import { BulkEnrollmentService } from "./bulk-enrollment.service";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { CourseNotificationRepository } from "./course-notification.repository";
import { CourseNotifier } from "./course-notifier";
import { CourseStatsRepository } from "./course-stats.repository";
import { LessonController } from "./lesson.controller";
import { LiveStreamController } from "./live-stream.controller";
import { LiveStreamService } from "./live-stream.service";
import { CourseNazirController } from "./nazir/course-nazir.controller";
import { CourseNazirRepository } from "./nazir/course-nazir.repository";
import { CourseNazirService } from "./nazir/course-nazir.service";
import { RecordingController } from "./recording.controller";
import { RecordingRepository } from "./recording.repository";
import { RecordingService } from "./recording.service";
import { RecordingEncodingPoller } from "./recording-encoding.poller";
import { RecordingReleasePoller } from "./recording-release.poller";
import { RecordingUploadController } from "./recording-upload.controller";
import { RecordingUploadService } from "./recording-upload.service";
import { ResourceFileController } from "./resource-file.controller";
import { ResourceFileService } from "./resource-file.service";

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
    StorageModule,
    // "Toplu talebe ekle" looks the addresses up in the realm.
    KeycloakAdminModule,
  ],
  controllers: [
    CourseController,
    LessonController,
    LiveStreamController,
    RecordingController,
    RecordingUploadController,
    ResourceFileController,
    CourseNazirController,
  ],
  // The context loader is read straight from the database, as `BanModule`
  // does: `CourseNazirService` asks the engine which role confers what.
  providers: [
    CourseService,
    BulkEnrollmentService,
    CourseRepository,
    LiveStreamService,
    RecordingRepository,
    RecordingService,
    RecordingUploadService,
    ResourceFileService,
    RecordingEncodingPoller,
    RecordingReleasePoller,
    CourseStatsRepository,
    CourseNotifier,
    CourseNotificationRepository,
    CourseNazirService,
    CourseNazirRepository,
    TedrisatAuthzContext,
    DatabaseService,
  ],
  // For AuthzBindingsModule's role resolver (MDRS-41): findKoskId,
  // isMuderris and findEnrollment have no CourseService counterpart, so the
  // repository is what is exported here. The service is the lesson notes'
  // (MDRS-150): whether the caller may see the course at all is `getDetail`'s.
  exports: [CourseRepository, CourseService],
})
export class CourseModule {}
