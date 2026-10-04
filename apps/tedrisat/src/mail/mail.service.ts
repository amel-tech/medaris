import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { SendMailOptions } from "nodemailer";
import type { ISmtpConfig } from "../config/smtp-env";

/** The SMTP settings, or null when unset (`readSmtpConfig`). Overridable in tests. */
export const MAIL_CONFIG = Symbol("MAIL_CONFIG");
/** What a message is handed to: nodemailer's SMTP transport, or a test's stub. */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

/** The part of a nodemailer transporter tedrisat uses. */
export interface IMailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
  close?(): void;
}

/** The iTIP methods tedrisat sends (RFC 5546 §3.2). */
export type CalendarMethod = "REQUEST" | "CANCEL";

export interface IMailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * An iCalendar object sent as a `text/calendar; method=…` alternative
   * (RFC 6047), which is what makes Gmail and Apple Mail show the message as
   * a calendar invitation rather than as a mail with a file.
   */
  calendar?: { method: CalendarMethod; content: string };
}

/**
 * The one way tedrisat sends e-mail (MDRS-121). Without `SMTP_HOST` it is
 * not configured: `send` logs that it skipped and returns false, and nothing
 * else changes, so a server without a sender boots and serves as before.
 * A configured send that fails throws; the caller decides what that means.
 *
 * The SMTP password stays inside the transport; nothing here logs a message
 * body or a recipient address.
 */
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_CONFIG) private readonly config: ISmtpConfig | null,
    @Inject(MAIL_TRANSPORT) private readonly transport: IMailTransport | null
  ) {}

  isConfigured(): boolean {
    return this.config !== null && this.transport !== null;
  }

  /** The sender's address, which an invitation also names as its ORGANIZER. */
  senderAddress(): string | null {
    return this.config?.from ?? null;
  }

  /** The sender's display name; "Medaris" unless configured otherwise. */
  senderName(): string | null {
    return this.config?.fromName ?? null;
  }

  async send(message: IMailMessage): Promise<boolean> {
    if (!this.config || !this.transport) {
      this.logger.debug(`SMTP is not configured; "${message.subject}" skipped`);
      return false;
    }
    await this.transport.sendMail({
      from: { name: this.config.fromName, address: this.config.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.calendar
        ? {
            icalEvent: {
              method: message.calendar.method,
              content: message.calendar.content,
              filename:
                message.calendar.method === "CANCEL"
                  ? "cancel.ics"
                  : "invite.ics",
            },
          }
        : {}),
    });
    return true;
  }

  onApplicationShutdown(): void {
    this.transport?.close?.();
  }
}
