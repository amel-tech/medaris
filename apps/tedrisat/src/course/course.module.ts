import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { KoskModule } from "../kosk/kosk.module";
import { CourseController } from "./course.controller";
import { CourseRepository } from "./course.repository";
import { CourseService } from "./course.service";

@Module({
  imports: [AuthGuardModule, KoskModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepository, DatabaseService],
})
export class CourseModule {}
