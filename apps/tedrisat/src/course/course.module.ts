import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { BanModule } from "../ban/ban.module";
import { DatabaseService } from "../database/database.service";
import { KoskModule } from "../kosk/kosk.module";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";
import { LessonController } from "./lesson.controller";
import { RecordingRepository } from "./recording.repository";

@Module({
  imports: [AuthGuardModule, KoskModule, BanModule],
  controllers: [CourseController, LessonController],
  providers: [
    CourseService,
    CourseRepository,
    RecordingRepository,
    DatabaseService,
  ],
  // For AuthzBindingsModule's role resolver (MDRS-41): findKoskId,
  // isMuderris and findEnrollment have no CourseService counterpart, so the
  // repository is what is exported here.
  exports: [CourseRepository],
})
export class CourseModule {}
