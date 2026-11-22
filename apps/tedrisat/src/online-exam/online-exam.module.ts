import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { ExamAttemptController } from "./exam-attempt.controller";
import { ExamAttemptRepository } from "./exam-attempt.repository";
import { ExamAttemptService } from "./exam-attempt.service";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";

/**
 * Online multiple-choice exams (MDRS-299): preparing them (topics, drafts and
 * questions) and a talebe's sitting of a published one.
 */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [OnlineExamController, ExamAttemptController],
  providers: [
    OnlineExamService,
    OnlineExamRepository,
    ExamAttemptService,
    ExamAttemptRepository,
  ],
})
export class OnlineExamModule {}
