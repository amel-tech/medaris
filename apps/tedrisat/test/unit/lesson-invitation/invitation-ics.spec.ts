import { sessionPageUrl } from "../../../src/course/calendar/lesson-calendar";
import {
  buildInvitationIcs,
  type InvitationInput,
  invitationUid,
} from "../../../src/lesson-invitation/invitation-ics";

const LESSON_ID = "5b0f6c1e-7a3d-4f2b-9c51-2d8e4a6b1f00";
const COURSE_ID = "0e7b9a44-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const PAGE = sessionPageUrl("https://tedris.example", COURSE_ID, LESSON_ID);

const input = (overrides: Partial<InvitationInput> = {}): InvitationInput => ({
  method: "REQUEST",
  lessonId: LESSON_ID,
  courseTitle: "Bina ve İzhar Şerhi",
  lessonTitle: "Açılış; giriş, mukaddime",
  startsAt: new Date("2026-10-01T18:00:00.000Z"),
  durationMinutes: 90,
  sequence: 0,
  sessionPageUrl: PAGE,
  locale: "tr",
  organizer: { address: "no-reply@medaris.test", name: 'Medaris "Ders"' },
  attendee: "talebe@example.org",
  now: new Date("2026-09-28T09:15:30.456Z"),
  ...overrides,
});

const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");
const line = (ics: string, name: string) =>
  unfold(ics).find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));
const prop = (ics: string, name: string) =>
  unfold(ics)
    .find((l) => l.startsWith(`${name}:`))
    ?.slice(name.length + 1);

describe("lesson invitation .ics (MDRS-121)", () => {
  it("is an iTIP REQUEST with the organizer and the attendee the mail clients need", () => {
    const ics = buildInvitationIcs(input());
    expect(prop(ics, "METHOD")).toBe("REQUEST");
    expect(prop(ics, "UID")).toBe(`lesson-invite-${LESSON_ID}@medaris.app`);
    expect(prop(ics, "SEQUENCE")).toBe("0");
    expect(prop(ics, "STATUS")).toBe("CONFIRMED");
    expect(line(ics, "ORGANIZER")).toBe(
      'ORGANIZER;CN="Medaris Ders":mailto:no-reply@medaris.test'
    );
    expect(line(ics, "ATTENDEE")).toBe(
      "ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:talebe@example.org"
    );
  });

  it("writes the times in UTC, with an end only when the session has a length", () => {
    const ics = buildInvitationIcs(input());
    expect(prop(ics, "DTSTART")).toBe("20261001T180000Z");
    expect(prop(ics, "DTEND")).toBe("20261001T193000Z");
    expect(prop(ics, "DTSTAMP")).toBe("20260928T091530Z");
    expect(ics).not.toContain("VTIMEZONE");
    const open = buildInvitationIcs(input({ durationMinutes: null }));
    expect(line(open, "DTEND")).toBeUndefined();
  });

  it("names the session and points at its page, never at a meeting link", () => {
    const ics = buildInvitationIcs(input());
    expect(prop(ics, "SUMMARY")).toBe(
      "Bina ve İzhar Şerhi — Açılış\\; giriş\\, mukaddime"
    );
    expect(prop(ics, "URL")).toBe(PAGE);
    expect(prop(ics, "DESCRIPTION")).toContain(PAGE);
    expect(ics).not.toMatch(/meet|zoom|X-GOOGLE-CONFERENCE/i);
  });

  it("cancels the same event with a higher SEQUENCE", () => {
    const ics = buildInvitationIcs(input({ method: "CANCEL", sequence: 3 }));
    expect(prop(ics, "METHOD")).toBe("CANCEL");
    expect(prop(ics, "STATUS")).toBe("CANCELLED");
    expect(prop(ics, "SEQUENCE")).toBe("3");
    expect(prop(ics, "UID")).toBe(invitationUid(LESSON_ID));
  });

  it("keeps a UID apart from the one-session file's, whose SEQUENCE is the course version", () => {
    expect(invitationUid(LESSON_ID)).not.toBe(
      `lesson-${LESSON_ID}@medaris.app`
    );
  });

  it("folds long lines at 75 octets and ends every line with CRLF", () => {
    const ics = buildInvitationIcs(
      input({ lessonTitle: "Uzun bir başlık ".repeat(12) })
    );
    for (const raw of ics.split("\r\n")) {
      expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(75);
    }
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("cannot be split by a line break smuggled into an address or a name", () => {
    const ics = buildInvitationIcs(
      input({
        attendee: "a@example.org\r\nATTENDEE:mailto:b@example.org",
        organizer: { address: "x@example.org", name: "Med\r\naris" },
      })
    );
    expect(unfold(ics).filter((l) => l.startsWith("ATTENDEE"))).toHaveLength(1);
    expect(unfold(ics).filter((l) => l.startsWith("ORGANIZER"))).toHaveLength(
      1
    );
  });
});
