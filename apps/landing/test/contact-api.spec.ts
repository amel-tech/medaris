import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_ADDRESS } from "~/lib/contact";
import { readSmtpConfig, SmtpConfigError } from "~/lib/contact-mail";

const { sendMail, createTransport, env } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMail,
    createTransport: vi.fn(() => ({ sendMail })),
    env: {} as Record<string, string | undefined>,
  };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("~/env", () => ({ env }));

const { POST, resetThrottle } = await import("../app/api/iletisim/route");

const message = {
  ad: "Ayşe Yılmaz",
  eposta: "ayse@example.org",
  konu: "ders-vermek",
  mesaj: "Medresemizin derslerini açmak istiyoruz.",
};

const post = (body: unknown, ip = "203.0.113.7") =>
  POST(
    new Request("http://localhost:4003/api/iletisim", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );

const configure = () =>
  Object.assign(env, {
    SMTP_HOST: "smtp.example.org",
    SMTP_FROM: "no-reply@medaris.app",
    SMTP_USER: "relay",
    SMTP_PASSWORD: "secret",
  });

beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  sendMail.mockReset();
  createTransport.mockClear();
  resetThrottle();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/iletisim", () => {
  it("goes to selam@medaris.app, the address the İletişim page prints", () => {
    expect(CONTACT_ADDRESS).toBe("selam@medaris.app");
  });

  it("answers 503 and sends nothing while no SMTP sender is configured", async () => {
    const response = await post(message);
    expect(response.status).toBe(503);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("answers 503, not 500, when the sender is half configured", async () => {
    env.SMTP_HOST = "smtp.example.org";
    const response = await post(message);
    expect(response.status).toBe(503);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("mails the message to the contact address with the visitor as Reply-To", async () => {
    configure();
    const response = await post(message);
    expect(response.status).toBe(200);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.org",
        // EHLO: the sender's domain, not the container's hostname.
        name: "medaris.app",
        port: 587,
        requireTLS: true,
        auth: { user: "relay", pass: "secret" },
      })
    );
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail.to).toBe("selam@medaris.app");
    expect(mail.from).toEqual({
      name: "Medaris",
      address: "no-reply@medaris.app",
    });
    expect(mail.replyTo).toEqual({
      name: "Ayşe Yılmaz",
      address: "ayse@example.org",
    });
    expect(mail.subject).toBe(
      "İletişim formu · Medaris’te ders vermek · Ayşe Yılmaz"
    );
    expect(mail.text).toContain("Medresemizin derslerini açmak istiyoruz.");
  });

  it("keeps a name with a line break out of the headers", async () => {
    configure();
    await post({ ...message, ad: "Ayşe\r\nBcc: x@example.org" });
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.replyTo.name).not.toMatch(/[\r\n]/);
  });

  it.each([
    ["an empty name", { ...message, ad: " " }, "ad"],
    [
      "an address with two recipients",
      { ...message, eposta: "a@x.org, b@y.org" },
      "eposta",
    ],
    ["an unknown topic", { ...message, konu: "reklam" }, "konu"],
    ["a message too long", { ...message, mesaj: "a".repeat(5001) }, "mesaj"],
  ])("refuses %s with 400 and names the field", async (_case, body, field) => {
    configure();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).fields).toContain(field);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("answers 429 after five messages from one sender in ten minutes", async () => {
    configure();
    for (let i = 0; i < 5; i++) {
      expect((await post(message)).status).toBe(200);
    }
    expect((await post(message)).status).toBe(429);
    expect((await post(message, "198.51.100.9")).status).toBe(200);
  });

  it("answers 502 when the SMTP server refuses the message", async () => {
    configure();
    sendMail.mockRejectedValueOnce(new Error("550 relay denied"));
    expect((await post(message)).status).toBe(502);
  });
});

describe("readSmtpConfig", () => {
  it("is null without SMTP_HOST", () => {
    expect(readSmtpConfig({})).toBeNull();
  });

  it("defaults the port to 465 with ssl", () => {
    expect(
      readSmtpConfig({
        SMTP_HOST: "h",
        SMTP_SECURITY: "ssl",
        SMTP_FROM: "a@b.org",
      })?.port
    ).toBe(465);
  });

  const invalid: [Record<string, string>, string][] = [
    [{ SMTP_HOST: "h" }, "no SMTP_FROM"],
    [
      { SMTP_HOST: "h", SMTP_FROM: "Medaris <a@b.org>" },
      "a display name in SMTP_FROM",
    ],
    [
      { SMTP_HOST: "h", SMTP_FROM: "a@b.org", SMTP_USER: "u" },
      "a user without a password",
    ],
    [
      {
        SMTP_HOST: "h",
        SMTP_FROM: "a@b.org",
        SMTP_SECURITY: "none",
        SMTP_USER: "u",
        SMTP_PASSWORD: "p",
      },
      "a password over a plain connection",
    ],
    [
      { SMTP_HOST: "h", SMTP_FROM: "a@b.org", SMTP_PORT: "smtp" },
      "a port that is not a number",
    ],
  ];

  it.each(invalid)("refuses %o (%s)", (input) => {
    expect(() => readSmtpConfig(input)).toThrow(SmtpConfigError);
  });
});
