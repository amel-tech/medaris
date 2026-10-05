import type { ISmtpConfig } from "../../../src/config/smtp-env";
import { createSmtpTransport } from "../../../src/mail/mail.module";
import { MailService } from "../../../src/mail/mail.service";

const CONFIG: ISmtpConfig = {
  host: "smtp.example.org",
  port: 587,
  security: "starttls",
  auth: null,
  from: "no-reply@medaris.test",
  fromName: "Medaris",
};

describe("MailService (MDRS-121)", () => {
  it("skips, and says it did, without a sender", async () => {
    const service = new MailService(null, null);
    expect(service.isConfigured()).toBe(false);
    await expect(
      service.send({ to: "a@example.org", subject: "s", text: "t", html: "h" })
    ).resolves.toBe(false);
  });

  it("builds no transport without a sender", () => {
    expect(createSmtpTransport(null)).toBeNull();
  });

  it("hands a calendar part to the transport as nodemailer's icalEvent", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const service = new MailService(CONFIG, { sendMail });
    await service.send({
      to: "talebe@example.org",
      subject: "Davet",
      text: "t",
      html: "<p>h</p>",
      calendar: { method: "REQUEST", content: "BEGIN:VCALENDAR" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "Medaris", address: "no-reply@medaris.test" },
        to: "talebe@example.org",
        icalEvent: {
          method: "REQUEST",
          content: "BEGIN:VCALENDAR",
          filename: "invite.ics",
        },
      })
    );
  });

  it("lets a failed send throw, for the caller to decide", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const service = new MailService(CONFIG, { sendMail });
    await expect(
      service.send({ to: "a@example.org", subject: "s", text: "t", html: "h" })
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("closes the pooled transport on shutdown", () => {
    const close = vi.fn();
    new MailService(CONFIG, {
      sendMail: vi.fn(),
      close,
    }).onApplicationShutdown();
    expect(close).toHaveBeenCalled();
  });

  it("renders a REQUEST as a text/calendar alternative with method=REQUEST", async () => {
    // nodemailer's stream transport builds the real MIME message without a
    // network: what the mail clients read.
    const { createTransport } = await import("nodemailer");
    const stream = createTransport({ streamTransport: true, buffer: true });
    let mime = "";
    const service = new MailService(CONFIG, {
      sendMail: async (options) => {
        const info = (await stream.sendMail(options)) as { message: Buffer };
        mime = info.message.toString("utf8");
        return info;
      },
    });
    await service.send({
      to: "talebe@example.org",
      subject: "Davet: Siyer — Mekke",
      text: "t",
      html: "<p>h</p>",
      calendar: {
        method: "REQUEST",
        content: "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nEND:VCALENDAR\r\n",
      },
    });
    expect(mime).toMatch(/Content-Type: multipart\/alternative/i);
    expect(mime).toMatch(
      /Content-Type: text\/calendar; charset=utf-8; method=REQUEST/i
    );
    expect(mime).toMatch(/From: Medaris <no-reply@medaris\.test>/);
  });
});
