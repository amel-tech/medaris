import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { OnlineExamController } from "./online-exam.controller";
import { OnlineExamRepository } from "./online-exam.repository";
import { OnlineExamService } from "./online-exam.service";
import { ZerothQuestionController } from "./zeroth-question.controller";
import { ZerothQuestionRepository } from "./zeroth-question.repository";
import { ZerothQuestionService } from "./zeroth-question.service";

/** Online multiple-choice exams (MDRS-299): topics, drafts and questions, and each medrese's zeroth question. */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [OnlineExamController, ZerothQuestionController],
  providers: [
    OnlineExamService,
    OnlineExamRepository,
    ZerothQuestionService,
    ZerothQuestionRepository,
  ],
})
export class OnlineExamModule {}
