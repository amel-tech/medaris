import {
  buildInvitationMail,
  type InvitationKind,
  type InvitationMailInput,
} from "../../../src/lesson-invitation/invitation-mail";

const PAGE = "https://tedris.example/courses/c-1/lessons/l-1";
const ACCOUNT = "https://tedris.example/account";

const input = (
  overrides: Partial<InvitationMailInput> = {}
): InvitationMailInput => ({
  kind: "NEW",
  locale: "tr",
  courseTitle: "Siyer okumaları",
  lessonTitle: "Mekke yılları",
  startsAt: new Date("2026-10-01T18:00:00.000Z"),
  durationMinutes: 60,
  timeZone: "Europe/Istanbul",
  sessionPageUrl: PAGE,
  accountUrl: ACCOUNT,
  ...overrides,
});

describe("lesson invitation e-mail (MDRS-121)", () => {
  it.each([
    "tr",
    "en",
    "ar",
  ] as const)("is written in %s for every kind, with the time, the page and the way to turn it off", (locale) => {
    const subjects = new Set<string>();
    for (const kind of ["NEW", "UPDATE", "CANCEL"] as InvitationKind[]) {
      const mail = buildInvitationMail(input({ locale, kind }));
      subjects.add(mail.subject.split(":")[0]);
      expect(mail.subject).toContain("Siyer okumaları — Mekke yılları");
      expect(mail.text).toContain("Mekke yılları");
      expect(mail.text).toContain(ACCOUNT);
      expect(mail.html).toContain(`lang="${locale}"`);
      if (kind === "CANCEL") {
        expect(mail.text).not.toContain(PAGE);
      } else {
        expect(mail.text).toContain(PAGE);
        expect(mail.html).toContain(`href="${PAGE}"`);
      }
    }
    // Three different words, so a reader tells the three apart at a glance.
    expect(subjects.size).toBe(3);
  });

  it("writes the time in the reader's zone, and names it", () => {
    const istanbul = buildInvitationMail(input({ locale: "en" }));
    expect(istanbul.text).toContain("21:00");
    expect(istanbul.text).toContain("GMT+3");
    const london = buildInvitationMail(
      input({ locale: "en", timeZone: "Europe/London" })
    );
    expect(london.text).toContain("19:00");
    expect(london.text).toContain("60 minutes");
  });

  it("sets Arabic right to left", () => {
    expect(buildInvitationMail(input({ locale: "ar" })).html).toContain(
      'dir="rtl"'
    );
  });

  it("escapes the titles in the HTML and keeps the subject on one line", () => {
    const mail = buildInvitationMail(
      input({
        courseTitle: '<script>alert("x")</script>',
        lessonTitle: "Satır\r\nBcc: someone@example.org",
      })
    );
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
