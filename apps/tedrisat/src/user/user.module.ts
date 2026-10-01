import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { CourseModule } from "../course/course.module";
import { DatabaseModule } from "../database/database.module";
import { KoskModule } from "../kosk/kosk.module";
import { MeController } from "./me.controller";
import { UserRepository } from "./user.repository";
import { UserService } from "./user.service";
import { UserSyncInterceptor } from "./user-sync.interceptor";
import { UserSyncService } from "./user-sync.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [AuthGuardModule, DatabaseModule, KoskModule, CourseModule],
  controllers: [MeController, UsersController],
  providers: [
    UserRepository,
    UserSyncService,
    UserService,
    { provide: APP_INTERCEPTOR, useClass: UserSyncInterceptor },
  ],
})
export class UserModule {}
