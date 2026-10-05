import { classifySendFailure } from "../../../src/lesson-invitation/lesson-invitation.service";

/** An SMTP reply as nodemailer's `_formatError` reports it. */
const reply = (command: string, response: string) =>
  Object.assign(new Error(`Command failed: ${response}`), {
    code: "EENVELOPE",
    command,
    response,
    responseCode: Number(response.slice(0, 3)),
  });

describe("classifySendFailure (MDRS-121)", () => {
  it.each([
    ["550 5.1.1 The email account that you tried to reach does not exist"],
    ["550-5.1.1 The email account that you tried to reach does not exist."],
    ["553 5.1.3 Invalid address"],
    ["552 5.2.2 Mailbox full"],
    ["550 5.2.1 The email account that you tried to reach is disabled"],
  ])("lays a permanent refusal of the address on the recipient: %s", (response) => {
    expect(classifySendFailure(reply("RCPT TO", response))).toBe("refused");
  });

  it.each([
    ["452 4.2.2 The email account is over quota"],
    ["450 4.2.1 The user is receiving mail too quickly"],
    ["451 4.1.8 Sender address domain does not resolve"],
  ])("lays a temporary refusal of the address on the recipient: %s", (response) => {
    expect(classifySendFailure(reply("RCPT TO", response))).toBe("deferred");
  });

  it.each([
    ["RCPT TO", "550 5.7.0 Mail relay denied"],
    ["RCPT TO", "550 5.7.1 Invalid credentials for relay"],
    ["RCPT TO", "550 5.4.5 Daily SMTP relay limit exceeded for user"],
    ["RCPT TO", "421 4.7.0 Try again later, closing connection"],
    ["RCPT TO", "550 No such user"],
    ["RCPT TO", "550 4.1.1 mismatched class"],
    ["MAIL FROM", "550 5.1.0 Sender address rejected"],
    ["MAIL FROM", "550 5.7.1 Sender rejected"],
    ["DATA", "554 5.2.3 Message too big"],
    ["DATA", "554 5.7.0 Message rejected"],
  ])("blames the server, not the address, for %s %s", (command, response) => {
    expect(classifySendFailure(reply(command, response))).toBe("failed");
  });

  it("blames the server for an error that carries no SMTP reply", () => {
    expect(
      classifySendFailure(
        Object.assign(new Error("connect ECONNREFUSED"), { code: "ESOCKET" })
      )
    ).toBe("failed");
    expect(
      classifySendFailure(
        Object.assign(new Error("Invalid login"), {
          code: "EAUTH",
          command: "AUTH PLAIN",
          response: "535 5.7.8 Username and Password not accepted",
          responseCode: 535,
        })
      )
    ).toBe("failed");
    expect(classifySendFailure(null)).toBe("failed");
    expect(classifySendFailure("boom")).toBe("failed");
  });
});
