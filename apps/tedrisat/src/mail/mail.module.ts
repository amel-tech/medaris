import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
import type { ISmtpConfig } from "../config/smtp-env";
import {
  type IMailTransport,
  MAIL_CONFIG,
  MAIL_TRANSPORT,
  MailService,
} from "./mail.service";

/** nodemailer takes milliseconds. A relay that does not answer must not hold the sweep. */
const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

/**
 * nodemailer's SMTP transport for the configured server, or null without one.
 * Pooled with a single connection: invitations go out one after another from
 * the sweep, and a relay such as Gmail's counts concurrent connections.
 */
export const createSmtpTransport = (
  config: ISmtpConfig | null
): IMailTransport | null =>
  config
    ? createTransport({
        pool: true,
        maxConnections: 1,
        host: config.host,
        port: config.port,
        secure: config.security === "ssl",
        requireTLS: config.security === "starttls",
        ignoreTLS: config.security === "none",
        ...(config.auth
          ? { auth: { user: config.auth.user, pass: config.auth.password } }
          : {}),
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
      })
    : null;

/** Outgoing e-mail (MDRS-121), with its config and transport as their own providers so a test can replace either. */
@Module({
  providers: [
    {
      provide: MAIL_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ISmtpConfig | null =>
        config.get<ISmtpConfig | null>("smtp") ?? null,
    },
    {
      provide: MAIL_TRANSPORT,
      inject: [MAIL_CONFIG],
      useFactory: createSmtpTransport,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
