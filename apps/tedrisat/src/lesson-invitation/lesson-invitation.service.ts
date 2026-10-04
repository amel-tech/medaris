import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isBareAddress } from "../config/smtp-env";
import {
  sessionPageUrl,
  toCalendarLocale,
} from "../course/calendar/lesson-calendar";
import { type CalendarMethod, MailService } from "../mail/mail.service";
import { buildInvitationIcs } from "./invitation-ics";
import { buildInvitationMail, type InvitationKind } from "./invitation-mail";
import {
  type IInvitationDue,
  LessonInvitationRepository,
} from "./lesson-invitation.repository";

/** How often the sweep runs on its own, besides the writes that kick it. */
export const INVITATION_SWEEP_INTERVAL_MS = 5 * 60_000;
/** A first invitation goes out once its session is this close. */
export const INVITATION_HORIZON_DAYS = 30;
/** Messages read per query; a full batch makes the sweep go round again. */
export const INVITATION_BATCH = 100;
/** Rounds one kick may take, so a stuck row can never spin the sweep. */
const MAX_ROUNDS_PER_RUN = 20;

const FALLBACK_TIME_ZONE = "Europe/Istanbul";

export interface IInvitationRound {
  requested: number;
  cancelled: number;
  /** Refused for good by the server for this recipient; not retried. */
  rejected: number;
  /** Put off by the server for this recipient alone; retried next round. */
  deferred: number;
  /** Claimed by another sweep first. */
  skipped: number;
  /** The server could not take mail; the round stopped and is retried later. */
  stalled: boolean;
  /** A query came back full, so more may be due. */
  more: boolean;
}

type Outcome = "sent" | "rejected" | "deferred" | "skipped";

/**
 * E-mails talebe calendar invitations for their sessions (MDRS-121).
 *
 * It does not react to events one by one. It reconciles: each round reads
 * which (session, talebe) pairs are owed a message — a REQUEST because the
 * session should be in the calendar and is not there as it is now, a CANCEL
 * because it should no longer be there — and sends exactly those. So every
 * reason a session leaves or changes is covered by one rule
 * (`LessonInvitationRepository`), whatever caused it: an approval, a moved or
 * cancelled session, a hidden course, a course left passive by a müderris
 * post that simply lapsed, a removed seat, a ban.
 *
 * `kick()` runs a round soon; `CourseService` calls it after each write that
 * can change what is owed, so a talebe hears within seconds. The timer runs a
 * round every five minutes for what no write announces (a post lapsing, a
 * session entering the horizon) and to retry what the server did not take.
 *
 * Off without a sender or without `TEDRIS_WEB_URL`: nothing is read, nothing
 * is written, no timer runs — which is every test app that does not ask for it.
 */
@Injectable()
export class LessonInvitationService
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(LessonInvitationService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private stopping = false;

  // All three must stay value imports: `import type` erases them from
  // `design:paramtypes` and Nest can no longer inject them.
  constructor(
    private readonly repo: LessonInvitationRepository,
    private readonly mail: MailService,
    private readonly config: ConfigService
  ) {}

  private get webUrl(): string | null {
    return this.config.get<string | null>("tedrisWeb.url") ?? null;
  }

  isEnabled(): boolean {
    return this.mail.isConfigured() && this.webUrl !== null && !this.stopping;
  }

  onApplicationBootstrap(): void {
    if (!this.mail.isConfigured()) return;
    if (this.webUrl === null) {
      this.logger.warn(
        "SMTP is configured but TEDRIS_WEB_URL is not: lesson invitations need the session page link and are not sent."
      );
      return;
    }
    this.timer = setInterval(() => this.kick(), INVITATION_SWEEP_INTERVAL_MS);
    this.timer.unref();
    this.kick();
  }

  /** A run in flight finishes before the database goes away. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.whenIdle();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Runs a round soon, without waiting for it. A kick during a run makes the
   * run go round once more instead of starting a second one beside it.
   */
  kick(): void {
    if (!this.isEnabled()) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
  }

  /** Resolves once no run is in flight. */
  async whenIdle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async run(): Promise<void> {
    // Off the caller's stack: the write that kicked has answered first.
    await new Promise((resolve) => setImmediate(resolve));
    for (let round = 0; round < MAX_ROUNDS_PER_RUN; round++) {
      this.again = false;
      let result: IInvitationRound;
      try {
        result = await this.round();
      } catch (error) {
        this.logger.error(
          `Invitation round failed: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
      if (result.stalled || this.stopping) return;
      if (!result.more && !this.again) return;
    }
  }

  /** One pass: cancellations first, then invitations and updates. */
  private async round(): Promise<IInvitationRound> {
    const result: IInvitationRound = {
      requested: 0,
      cancelled: 0,
      rejected: 0,
      deferred: 0,
      skipped: 0,
      stalled: false,
      more: false,
    };
    const cancellations =
      await this.repo.findCancellationsDue(INVITATION_BATCH);
    for (const due of cancellations) {
      const outcome = await this.deliver("CANCEL", due);
      if (outcome === null) return { ...result, stalled: true };
      this.count(result, outcome, "cancelled");
    }
    const requests = await this.repo.findRequestsDue(
      INVITATION_HORIZON_DAYS,
      INVITATION_BATCH
    );
    for (const due of requests) {
      const outcome = await this.deliver("REQUEST", due);
      if (outcome === null) return { ...result, stalled: true };
      this.count(result, outcome, "requested");
    }
    // Rows of deleted sessions whose CANCEL is out, or whose time is past.
    await this.repo.pruneOrphans();
    // A put-off message is read again first, so going round now would only
    // ask the server the same thing: what is left waits for the timer.
    result.more =
      result.deferred === 0 &&
      (cancellations.length === INVITATION_BATCH ||
        requests.length === INVITATION_BATCH);
    if (
      result.requested + result.cancelled + result.rejected + result.deferred >
      0
    ) {
      this.logger.log(
        `Lesson invitations: ${result.requested} sent, ${result.cancelled} cancelled, ${result.rejected} refused by the server, ${result.deferred} put off`
      );
    }
    return result;
  }

  private count(
    result: IInvitationRound,
    outcome: Outcome,
    sent: "requested" | "cancelled"
  ): void {
    if (outcome === "sent") result[sent]++;
    else result[outcome]++;
  }

  /**
   * Claims, builds and sends one message. What a failed send leaves depends
   * on whose problem the server said it was (`classifySendFailure`):
   *
   * - this one address, for good: the claim stands and it is not retried;
   * - this one address, for now: the claim is undone and the round goes on,
   *   so one full mailbox cannot hold back everyone behind it;
   * - anything else — the connection, the login, the relay, the sender, the
   *   message: the claim is undone and null stops the round rather than fail
   *   the same way for every message behind it. A later round retries.
   */
  private async deliver(
    method: CalendarMethod,
    due: IInvitationDue
  ): Promise<Outcome | null> {
    const webUrl = this.webUrl;
    if (!webUrl) return "skipped";
    const previous = await this.repo.find(due.lessonId, due.userId);
    const sequence =
      method === "CANCEL"
        ? await this.repo.claimCancel(due)
        : await this.repo.claimRequest(due);
    if (sequence === null) return "skipped";
    if (!isBareAddress(due.email)) {
      // The claim stands, as for an address the server refused: it is not
      // one address, and would not become one on a later round.
      this.logger.warn(
        `User ${due.userId} has no single e-mail address; the ${method} for session ${due.lessonId} is not sent`
      );
      return "rejected";
    }

    const kind: InvitationKind =
      method === "CANCEL"
        ? "CANCEL"
        : due.lastSequence === null || due.lastCancelled
          ? "NEW"
          : "UPDATE";
    const locale = toCalendarLocale(due.locale);
    const pageUrl = sessionPageUrl(webUrl, due.courseId, due.lessonId);
    const content = buildInvitationIcs({
      method,
      lessonId: due.lessonId,
      courseTitle: due.courseTitle,
      lessonTitle: due.lessonTitle,
      startsAt: due.startsAt,
      durationMinutes: due.durationMinutes,
      sequence,
      sessionPageUrl: pageUrl,
      locale,
      organizer: {
        address: this.mail.senderAddress() ?? "",
        name: this.mail.senderName() ?? "Medaris",
      },
      attendee: due.email,
      now: new Date(),
    });
    const message = buildInvitationMail({
      kind,
      locale,
      courseTitle: due.courseTitle,
      lessonTitle: due.lessonTitle,
      startsAt: due.startsAt,
      durationMinutes: due.durationMinutes,
      timeZone: usableTimeZone(due.timeZone),
      sessionPageUrl: pageUrl,
      accountUrl: `${webUrl}/account`,
    });

    try {
      await this.mail.send({
        to: due.email,
        ...message,
        calendar: { method, content },
      });
      return "sent";
    } catch (error) {
      const failure = classifySendFailure(error);
      if (failure === "refused") {
        // The claim stands: this address is refused for good, and sending
        // it again every round would only be refused again.
        this.logger.warn(
          `The SMTP server refused the ${method} for session ${due.lessonId} to user ${due.userId} (${describe(error)}); it is not retried`
        );
        return "rejected";
      }
      this.logger[failure === "deferred" ? "warn" : "error"](
        `Could not send the ${method} for session ${due.lessonId} to user ${due.userId}: ${describe(error)}`
      );
      await this.repo
        .restore(due.lessonId, due.userId, sequence, previous)
        .catch((restoreError: unknown) =>
          this.logger.error(
            `Could not undo the claim for session ${due.lessonId}, user ${due.userId}: ${describe(restoreError)}`
          )
        );
      return failure === "deferred" ? "deferred" : null;
    }
  }
}

/**
 * Whose problem a failed send was, read off the SMTP reply:
 *
 * - `refused`: the server refused this recipient for good;
 * - `deferred`: it put this recipient off for now;
 * - `failed`: anything else.
 *
 * Only a reply to RCPT TO whose enhanced status code (RFC 3463) is about the
 * address (X.1.x) or the mailbox (X.2.x) is laid on the recipient. nodemailer
 * reports MAIL FROM and DATA rejections as `EENVELOPE` too, and a relay that
 * denies everyone (bad credentials, an IP not allow-listed, a daily limit:
 * X.7.x, X.4.x, X.3.x) answers RCPT TO with a 5xx for every recipient — read
 * as refusals, each would keep its claim and every message would be lost as
 * if it had been delivered. A reply without an enhanced code is `failed`, so
 * the worst a misread costs is a retry, never a lost message.
 */
export type SendFailure = "refused" | "deferred" | "failed";

const ENHANCED_STATUS = /^\d{3}[ -]([245])\.(\d{1,3})\.\d{1,3}(?:\s|$)/;

export const classifySendFailure = (error: unknown): SendFailure => {
  const e = error as {
    command?: unknown;
    responseCode?: unknown;
    response?: unknown;
  } | null;
  if (
    e?.command !== "RCPT TO" ||
    typeof e.responseCode !== "number" ||
    typeof e.response !== "string"
  ) {
    return "failed";
  }
  const status = ENHANCED_STATUS.exec(e.response);
  if (!status) return "failed";
  const [, klass, subject] = status;
  if (subject !== "1" && subject !== "2") return "failed";
  const reply = Math.floor(e.responseCode / 100);
  if (reply === 5 && klass === "5") return "refused";
  if (reply === 4 && klass === "4") return "deferred";
  return "failed";
};

/**
 * An SMTP failure by its codes alone: nodemailer's message quotes the
 * server's reply, which may echo the recipient's address into the log.
 * Anything else (a database error) by its message.
 */
const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const { code, responseCode } = error as {
    code?: unknown;
    responseCode?: unknown;
  };
  if (typeof code === "string") {
    return typeof responseCode === "number" ? `${code} ${responseCode}` : code;
  }
  return error.message;
};

/** A zone `Intl` accepts; a stored value it does not know falls back to Istanbul. */
const usableTimeZone = (zone: string): string => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
};
