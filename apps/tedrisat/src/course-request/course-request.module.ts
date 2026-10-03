import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { CourseRequestController } from "./course-request.controller";
import { CourseRequestRepository } from "./course-request.repository";
import { CourseRequestService } from "./course-request.service";

/** Medrese dışı ders talepleri (MDRS-181, nizam/39). */
@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule],
  controllers: [CourseRequestController],
  providers: [CourseRequestService, CourseRequestRepository],
})
export class CourseRequestModule {}
