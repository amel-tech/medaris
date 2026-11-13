import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isTestRunner } from "../config/security-env";
import { isBareAddress } from "../config/smtp-env";
import {
  sessionPageUrl,
  toCalendarLocale,
} from "../course/calendar/lesson-calendar";
import { CourseNotifier } from "../course/course-notifier";
import { MailService } from "../mail/mail.service";
import { ExamRepository, type IExamReminder } from "./exam.repository";
import { buildExamReminderMail } from "./exam-reminder-mail";

/** How often the reminder poll runs. */
export const EXAM_REMINDER_POLL_INTERVAL_MS = 60_000;
/** How far ahead an exam is reminded of: a day. */
export const EXAM_REMINDER_AHEAD_MS = 24 * 60 * 60_000;
/** Exams claimed per pass; what is left goes on the next one. */
export const EXAM_REMINDER_BATCH = 50;

/**
 * "Yaklaşan sınav" (MDRS-248): a day before an exam its talebe are told in the
 * app and, when tedrisat has a sender and tedris' address, by e-mail. It
 * follows `RecordingReleasePoller`: every minute it claims the exams that
 * start within a day (`reminded_at`, one statement that checks and marks),
 * so each is reminded of once, whichever instance gets there first. An exam
 * planned less than a day ahead is reminded of on the next pass. Like every
 * producer, a reminder that cannot be sent is logged and not retried.
 *
 * Under the test runner no timer runs: a spec calls `remindDue` with its own
 * clock.
 */
@Injectable()
export class ExamReminderPoller
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ExamReminderPoller.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  // All must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: ExamRepository,
    private readonly notifier: CourseNotifier,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  onApplicationBootstrap(): void {
    if (isTestRunner()) return;
    this.timer = setInterval(() => {
      void this.remindDue().catch((error: unknown) =>
        this.logger.error(
          `Exam reminder poll failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }, EXAM_REMINDER_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass; returns how many exams it claimed. A pass is never overlapped. */
  async remindDue(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.repo.claimDueReminders(
        now,
        EXAM_REMINDER_AHEAD_MS,
        EXAM_REMINDER_BATCH
      );
      for (const exam of due) {
        await this.notifier.examReminder(exam.lessonId, exam.scheduledAt);
        await this.mailTalebe(exam);
      }
      return due.length;
    } finally {
      this.running = false;
    }
  }

  private async mailTalebe(exam: IExamReminder): Promise<void> {
    const webUrl = this.config.get<string | null>("tedrisWeb.url") ?? null;
    if (!this.mail.isConfigured() || webUrl === null) return;
    try {
      const recipients = await this.repo.reminderRecipients(exam.courseId);
      for (const recipient of recipients) {
        if (!isBareAddress(recipient.email)) continue;
        const message = buildExamReminderMail({
          locale: toCalendarLocale(recipient.locale),
          courseTitle: exam.courseTitle,
          lessonTitle: exam.lessonTitle,
          startsAt: exam.scheduledAt,
          timeZone: recipient.timeZone,
          sessionPageUrl: sessionPageUrl(webUrl, exam.courseId, exam.lessonId),
          accountUrl: `${webUrl}/account`,
        });
        try {
          await this.mail.send({ to: recipient.email, ...message });
        } catch (error) {
          this.logger.warn(
            `Exam reminder for ${exam.lessonId} not sent to one talebe: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Could not mail the reminder of exam ${exam.lessonId}`,
        error
      );
    }
  }
}
