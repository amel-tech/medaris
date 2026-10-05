import { readSmtpConfig } from "../../../src/config/smtp-env";

const read = (env: Record<string, string>) =>
  readSmtpConfig(env as NodeJS.ProcessEnv);

const BASE = {
  SMTP_HOST: "smtp-relay.gmail.com",
  SMTP_FROM: "no-reply@medaris.test",
};

describe("SMTP_* (MDRS-121)", () => {
  it("is off without SMTP_HOST, whatever else is set", () => {
    expect(read({})).toBeNull();
    expect(read({ SMTP_HOST: "  ", SMTP_FROM: "x@y.z" })).toBeNull();
  });

  it("defaults to STARTTLS on 587, no AUTH, and the Medaris display name", () => {
    expect(read(BASE)).toEqual({
      host: "smtp-relay.gmail.com",
      port: 587,
      security: "starttls",
      auth: null,
      from: "no-reply@medaris.test",
      fromName: "Medaris",
    });
  });

  it("defaults ssl to 465 and takes an explicit port", () => {
    expect(read({ ...BASE, SMTP_SECURITY: "SSL" })?.port).toBe(465);
    expect(read({ ...BASE, SMTP_PORT: "2525" })?.port).toBe(2525);
  });

  it("takes the credentials together", () => {
    expect(
      read({ ...BASE, SMTP_USER: "relay", SMTP_PASSWORD: "p$ss" })?.auth
    ).toEqual({ user: "relay", password: "p$ss" });
  });

  it.each([
    [{ SMTP_FROM: "" }, /SMTP_FROM is required/],
    [{ SMTP_FROM: "Medaris <no-reply@medaris.test>" }, /bare address/],
    [{ SMTP_SECURITY: "tls" }, /SMTP_SECURITY/],
    [{ SMTP_PORT: "smtp" }, /SMTP_PORT/],
    [{ SMTP_PORT: "70000" }, /SMTP_PORT/],
    [{ SMTP_USER: "relay" }, /together/],
    [{ SMTP_PASSWORD: "secret" }, /together/],
    [
      { SMTP_SECURITY: "none", SMTP_USER: "relay", SMTP_PASSWORD: "secret" },
      /clear text/,
    ],
  ])("stops the boot on %j", (overrides, message) => {
    expect(() => read({ ...BASE, ...overrides })).toThrow(message);
  });

  it("never repeats the password in a refusal", () => {
    expect(() =>
      read({
        ...BASE,
        SMTP_SECURITY: "none",
        SMTP_USER: "relay",
        SMTP_PASSWORD: "hunter2-secret",
      })
    ).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("hunter2-secret"),
      })
    );
  });
});
