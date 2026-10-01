import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  buildCalendarFeedIcs,
  sessionPageUrl,
  toCalendarLocale,
} from "../course/calendar/lesson-calendar";
import { CalendarNotConfiguredError } from "../course/errors/calendar-not-configured.error";
import { CalendarFeedRepository } from "./calendar-feed.repository";
import {
  calendarFeedUrls,
  hashCalendarFeedToken,
  newCalendarFeedToken,
  tokenFromFeedFile,
} from "./calendar-feed-token";
import { CalendarFeedNotFoundError } from "./errors/calendar-feed-not-found.error";
import { FeedPollLimiter } from "./feed-poll-limiter";

const DAY_MS = 24 * 60 * 60 * 1000;
/** The feed's window, from the issue: 30 days back, 180 ahead. */
export const FEED_DAYS_BACK = 30;
export const FEED_DAYS_AHEAD = 180;

@Injectable()
export class CalendarFeedService {
  private readonly polls = new FeedPollLimiter();

  // Both must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: CalendarFeedRepository,
    private readonly config: ConfigService
  ) {}

  /** tedris-web's origin — the feed URL and every session link live there. */
  private webUrl(): string {
    const url = this.config.get<string | null>("tedrisWeb.url");
    if (!url) throw new CalendarNotConfiguredError();
    return url;
  }

  async status(
    userId: string
  ): Promise<{ active: boolean; createdAt: Date | null }> {
    const createdAt = await this.repo.findCreatedAt(userId);
    return { active: createdAt !== null, createdAt };
  }

  /**
   * Issues a new feed URL and makes the previous one, if any, answer 404.
   * The token is returned this once; only its hash is kept.
   */
  async regenerate(
    userId: string
  ): Promise<{ url: string; webcalUrl: string; createdAt: Date }> {
    const webUrl = this.webUrl();
    const token = newCalendarFeedToken();
    const createdAt = await this.repo.replaceToken(
      userId,
      hashCalendarFeedToken(token)
    );
    return { ...calendarFeedUrls(webUrl, token), createdAt };
  }

  /** The feed behind `<token>.ics`, as an iCalendar document. */
  async feed(file: string, now: Date = new Date()): Promise<string> {
    const webUrl = this.webUrl();
    const token = tokenFromFeedFile(file);
    if (!token) throw new CalendarFeedNotFoundError();
    const userId = await this.repo.findUserIdByHash(
      hashCalendarFeedToken(token)
    );
    if (!userId) throw new CalendarFeedNotFoundError();
    this.polls.hit(userId);

    const [sessions, userLocale] = await Promise.all([
      this.repo.findSessions(
        userId,
        new Date(now.getTime() - FEED_DAYS_BACK * DAY_MS),
        new Date(now.getTime() + FEED_DAYS_AHEAD * DAY_MS)
      ),
      this.repo.findUserLocale(userId),
    ]);
    const locale = toCalendarLocale(userLocale);

    // Field by field: nothing that is not listed here reaches the feed, and
    // the meeting link is not in the query to begin with.
    return buildCalendarFeedIcs(
      sessions.map((s) => ({
        course: {
          id: s.courseId,
          title: s.courseTitle,
          version: s.courseVersion,
        },
        lesson: {
          id: s.lessonId,
          title: s.lessonTitle,
          scheduledAt: s.scheduledAt,
          durationMinutes: s.durationMinutes,
        },
        sessionPageUrl: sessionPageUrl(webUrl, s.courseId, s.lessonId),
        locale,
        now,
        cancelled: s.cancelled,
      }))
    );
  }
}
