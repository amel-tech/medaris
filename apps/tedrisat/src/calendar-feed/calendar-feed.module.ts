import { AuthGuardModule } from "@medaris/common";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { CalendarFeedController } from "./calendar-feed.controller";
import { CalendarFeedRepository } from "./calendar-feed.repository";
import { CalendarFeedService } from "./calendar-feed.service";
import { MeCalendarFeedController } from "./me-calendar-feed.controller";

/** The personal calendar feed and its URL (MDRS-120). */
@Module({
  imports: [AuthGuardModule, DatabaseModule],
  controllers: [CalendarFeedController, MeCalendarFeedController],
  providers: [CalendarFeedService, CalendarFeedRepository],
})
export class CalendarFeedModule {}
