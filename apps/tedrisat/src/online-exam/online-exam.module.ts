import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";

/** Preparing online multiple-choice exams (MDRS-299): topics, drafts and questions. */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [OnlineExamController],
  providers: [OnlineExamService, OnlineExamRepository],
})
export class OnlineExamModule {}
