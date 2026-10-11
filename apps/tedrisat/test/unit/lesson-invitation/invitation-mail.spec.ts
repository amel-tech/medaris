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
  attendance: { inPerson: false, hasMeetingLink: true, hasLiveStream: false },
  accountUrl: ACCOUNT,
  ...overrides,
});

const attended = (
  attendance: Partial<InvitationMailInput["attendance"]>
): InvitationMailInput["attendance"] => ({
  inPerson: false,
  hasMeetingLink: false,
  hasLiveStream: false,
  ...attendance,
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

  /**
   * MDRS-283: the line under the page says how the session is attended, in
   * the event's own terms: the meeting link only where the session can have
   * one, its own line for a session held in person or only streamed.
   */
  it.each([
    [
      "a meeting link",
      { hasMeetingLink: true },
      {
        tr: "Toplantı bağlantısı yalnızca celse sayfasında",
        en: "The meeting link is shown only on the session page",
        ar: "رابط الاجتماع",
      },
    ],
    [
      "only a stream",
      { hasLiveStream: true },
      {
        tr: "Bu celse canlı yayınlanır.",
        en: "This session is streamed live.",
        ar: "تُبثّ هذه الحلقة بثًّا مباشرًا.",
      },
    ],
    [
      "the in-person mark",
      { inPerson: true },
      {
        tr: "Bu celse yüz yüze yapılır.",
        en: "This session is held in person.",
        ar: "تُعقد هذه الحلقة حضوريًّا.",
      },
    ],
    [
      "the in-person mark and a meeting link",
      { inPerson: true, hasMeetingLink: true },
      {
        tr: "Bu celse yüz yüze yapılır. Toplantı bağlantısı yalnızca celse sayfasında",
        en: "This session is held in person. The meeting link is shown only on the session page",
        ar: "تُعقد هذه الحلقة حضوريًّا. يظهر رابط الاجتماع في صفحة الحلقة",
      },
    ],
    [
      "the in-person mark and a stream",
      { inPerson: true, hasLiveStream: true },
      {
        tr: "Bu celse yüz yüze yapılır ve canlı yayınlanır.",
        en: "This session is held in person and streamed live.",
        ar: "تُعقد هذه الحلقة حضوريًّا وتُبثّ بثًّا مباشرًا.",
      },
    ],
  ] as const)("words a session with %s by it, in tr, en and ar", (_name, attendance, words) => {
    for (const locale of ["tr", "en", "ar"] as const) {
      const mail = buildInvitationMail(
        input({ locale, attendance: attended(attendance) })
      );
      expect(mail.text).toContain(words[locale]);
      expect(mail.html).toContain(words[locale]);
    }
    if (!("hasMeetingLink" in attendance)) {
      for (const locale of ["tr", "en", "ar"] as const) {
        const text = buildInvitationMail(
          input({ locale, attendance: attended(attendance) })
        ).text;
        expect(text).not.toMatch(
          /Toplantı bağlantısı|meeting link|رابط الاجتماع/
        );
      }
    }
  });

  it("leaves the line out of a CANCEL, whatever the session was", () => {
    const mail = buildInvitationMail(
      input({ kind: "CANCEL", attendance: attended({ inPerson: true }) })
    );
    expect(mail.text).not.toContain("yüz yüze");
  });
});
