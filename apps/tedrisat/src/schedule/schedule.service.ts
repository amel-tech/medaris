import { Injectable } from "@nestjs/common";
import { SessionStatus } from "../course/domain/session-status.enum";
import { sessionStatus } from "../course/domain/session-view";
import { ScheduleSessionResponse } from "./dto/schedule-session-response.dto";
import { IScheduledSession, ScheduleRepository } from "./schedule.repository";
import { parseScheduleWindow } from "./schedule-window";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_UPCOMING = 5;
export const MAX_UPCOMING = 20;
/** How far ahead "upcoming" looks; further than any programme is scheduled. */
const UPCOMING_DAYS = 180;

@Injectable()
export class ScheduleService {
  // Must stay a value import: `import type` erases it from
  // `design:paramtypes` and Nest can no longer inject it.
  constructor(private readonly repo: ScheduleRepository) {}

  /** The caller's sessions in `[from, to)`: Programım (tedris/21). */
  async list(
    userId: string,
    from: string | undefined,
    to: string | undefined,
    now: Date = new Date()
  ): Promise<ScheduleSessionResponse[]> {
    const window = parseScheduleWindow(from, to);
    const rows = await this.repo.findEnrolledSessions(
      userId,
      window.from,
      window.to
    );
    return this.handedOut(userId, rows, now, "schedule");
  }

  /** The caller's next sessions: the phone menu's "Sıradaki celse" (tedris/44). */
  async upcoming(
    userId: string,
    limit: number,
    now: Date = new Date()
  ): Promise<ScheduleSessionResponse[]> {
    const rows = await this.repo.findUpcoming(
      userId,
      now,
      new Date(now.getTime() + UPCOMING_DAYS * DAY_MS),
      Math.min(Math.max(limit, 1), MAX_UPCOMING)
    );
    return this.handedOut(userId, rows, now, "schedule.upcoming");
  }

  /**
   * The responses, after the record of what they open. Only the köşk's nazımı
   * still finds a passive course in these lists (`enrolledCourseIds`), and a
   * live link of one is passive content: it goes on the record before it is
   * returned, as the course's own page records it (owner, 4 October: their
   * reads stay audited).
   */
  private async handedOut(
    userId: string,
    rows: IScheduledSession[],
    now: Date,
    via: string
  ): Promise<ScheduleSessionResponse[]> {
    const responses = rows.map((row) => toResponse(row, now));
    const linked = new Map<string, string>();
    for (const response of responses) {
      if (response.meetingUrl) {
        linked.set(response.courseId, response.courseTitle);
      }
    }
    const passive = await this.repo.passiveScopesOf([...linked.keys()]);
    await this.repo.recordPassiveOpens(
      userId,
      [...passive].map(([courseId, passiveScope]) => ({
        courseId,
        courseTitle: linked.get(courseId) ?? "",
        passiveScope,
      })),
      via
    );
    return responses;
  }
}

const toResponse = (row: IScheduledSession, now: Date) => {
  const status = sessionStatus(
    {
      cancelledAt: row.cancelledAt,
      scheduledAt: row.startsAt,
      durationMinutes: row.durationMinutes,
    },
    now
  );
  const joinable =
    status === SessionStatus.SCHEDULED || status === SessionStatus.LIVE;
  const response: ScheduleSessionResponse = {
    id: row.id,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    koskId: row.koskId,
    koskName: row.koskName,
    weekNumber: row.weekNumber,
    title: row.title,
    startsAt: row.startsAt,
    durationMinutes: row.durationMinutes,
    status,
    meetingUrl: joinable ? row.meetingUrl : null,
  };
  return response;
};
