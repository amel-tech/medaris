import {
  AuthGuardModule,
  AuthzModule,
  LoggerModule,
  RateLimitModule,
} from "@medaris/common";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AssignmentModule } from "./assignment/assignment.module";
import { AuthzBindingsModule } from "./authz/authz-bindings.module";
import { CalendarFeedModule } from "./calendar-feed/calendar-feed.module";
import { configuration } from "./config";
import { CourseModule } from "./course/course.module";
import { DatabaseModule } from "./database/database.module";
import { FlashcardModule } from "./flashcard/flashcard.module";
import { FlashcardLabelModule } from "./flashcard/flashcard-label.module";
import { KoskModule } from "./kosk/kosk.module";
import { MadrasahModule } from "./madrasah/madrasah.module";
import { NotificationModule } from "./notification/notification.module";
import { UserModule } from "./user/user.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // No envFilePath: ./load-env.ts has already applied the single root
      // .env, with the app prefixes stripped. Pointing ConfigModule at a
      // file as well would re-add the prefixed keys and, worse, would read a
      // stale apps/<app>/.env if one were ever left behind.
    }),
    LoggerModule.forRoot(),
    RateLimitModule,
    AuthGuardModule,
    AuthzModule,
    AuthzBindingsModule,
    DatabaseModule,
    FlashcardModule,
    FlashcardLabelModule,
    KoskModule,
    MadrasahModule,
    CourseModule,
    CalendarFeedModule,
    NotificationModule,
    AssignmentModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
