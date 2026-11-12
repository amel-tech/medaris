import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { EvaluationController } from "./evaluation.controller";
import { EvaluationRepository } from "./evaluation.repository";
import { EvaluationService } from "./evaluation.service";

/** The course team's marks on memorisation homework, and the talebe's read of theirs (MDRS-248). */
@Module({
  imports: [AuthGuardModule, CourseModule, DatabaseModule],
  controllers: [EvaluationController],
  providers: [EvaluationService, EvaluationRepository],
})
export class EvaluationModule {}
