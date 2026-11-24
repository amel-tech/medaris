import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { CourseModule } from "../course/course.module";
import { DatabaseService } from "../database/database.service";
import { StorageModule } from "../storage/storage.module";
import { LessonBoardController } from "./lesson-board.controller";
import { LessonBoardRepository } from "./lesson-board.repository";
import { LessonBoardService } from "./lesson-board.service";

@Module({
  imports: [AuthGuardModule, CourseModule, StorageModule],
  controllers: [LessonBoardController],
  providers: [LessonBoardService, LessonBoardRepository, DatabaseService],
})
export class LessonBoardModule {}
