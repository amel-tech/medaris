import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { MailModule } from "../mail/mail.module";
import { ExamController } from "./exam.controller";
import { ExamRepository } from "./exam.repository";
import { ExamService } from "./exam.service";
import { ExamReminderPoller } from "./exam-reminder.poller";

/** Exams (MDRS-248): results, their release, "Notlarım", a medrese's summary and the reminder. */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule, MailModule],
  controllers: [ExamController],
  providers: [ExamService, ExamRepository, ExamReminderPoller],
  exports: [ExamRepository],
})
export class ExamModule {}
