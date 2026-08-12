import { AuthGuardModule, LoggerModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { configuration } from "./config";
import { CourseModule } from "./course/course.module";
import { DatabaseModule } from "./database/database.module";
import { ExampleModule } from "./example/example.module";
import { FlashcardModule } from "./flashcard/flashcard.module";
import { FlashcardLabelModule } from "./flashcard/flashcard-label.module";
import { KoskModule } from "./kosk/kosk.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ".env",
    }),
    LoggerModule.forRoot(),
    AuthGuardModule,
    DatabaseModule,
    ExampleModule,
    FlashcardModule,
    FlashcardLabelModule,
    KoskModule,
    CourseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
