import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import {
  CourseSubmissionsController,
  LessonSubmissionController,
} from "./lesson-submission.controller";
import { LessonSubmissionRepository } from "./lesson-submission.repository";
import { LessonSubmissionService } from "./lesson-submission.service";

/** A talebe's homework on a celse, and the course staff's read of it (MDRS-290). */
@Module({
  imports: [
    AuthGuardModule,
    CourseModule,
    DatabaseModule,
    NotificationModule,
    StorageModule,
  ],
  controllers: [LessonSubmissionController, CourseSubmissionsController],
  providers: [LessonSubmissionService, LessonSubmissionRepository],
})
export class LessonSubmissionModule {}
