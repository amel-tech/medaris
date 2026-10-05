import {
  type CalendarLocale,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  lessonCalendarDescription,
  lessonCalendarSummary,
  lessonEnd,
} from "../course/calendar/lesson-calendar";
import type { CalendarMethod } from "../mail/mail.service";

/**
 * One session as an e-mailed calendar invitation (MDRS-121): an iTIP message
 * (RFC 5546) with METHOD:REQUEST to invite or update, METHOD:CANCEL to take
 * the event back out of the calendar.
 *
 * What it shares with the "Takvime ekle" file (MDRS-117) is the event's
 * words: the summary, and a description that says the meeting link is on the
 * session page. The meeting link itself is never here — the input has no
 * field for it, and the sweep never reads `lessons.meeting_url`.
 *
 * What differs, on purpose:
 *
 * - **The UID.** `lesson-invite-<id>@medaris.app`, not the file's
 *   `lesson-<id>@medaris.app`. The file and the feed use the course version
 *   as SEQUENCE; an invitation counts its own messages per recipient. With one
 *   UID, a calendar that imported the file at SEQUENCE 7 would drop an
 *   invitation at SEQUENCE 0 as stale, and the two could not be told apart.
 * - **UTC times.** An invitation is read in the recipient's zone by their own
 *   calendar; UTC needs no VTIMEZONE and cannot be misread.
 * - **ORGANIZER and ATTENDEE**, which Gmail and Apple Mail require before they
 *   show a message as an invitation. RSVP=FALSE: nobody collects the answers,
 *   so the clients are asked not to send them.
 *
 * Pure: no clock, no configuration.
 */
export interface InvitationInput {
  method: CalendarMethod;
  lessonId: string;
  courseTitle: string;
  lessonTitle: string;
  startsAt: Date;
  durationMinutes: number | null;
  /** The per-recipient SEQUENCE this message carries. */
  sequence: number;
  /** Absolute URL of the session page in tedris-web. */
  sessionPageUrl: string;
  locale: CalendarLocale;
  organizer: { address: string; name: string };
  attendee: string;
  now: Date;
}

export const invitationUid = (lessonId: string): string =>
  `lesson-invite-${lessonId}@medaris.app`;

/** A parameter value (RFC 5545 §3.2): quoted, with the characters it cannot hold removed. */
const quoteParam = (value: string): string =>
  `"${value.replace(/["\r\n]/g, "")}"`;

/** `mailto:` with the address kept as it is; a CAL-ADDRESS is a URI, not TEXT. */
const calAddress = (address: string): string =>
  `mailto:${address.replace(/[\r\n]/g, "")}`;

export const buildInvitationIcs = (input: InvitationInput): string => {
  const end = lessonEnd(input.startsAt, input.durationMinutes);
  const cancel = input.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Medaris//tedrisat//TR",
    "CALSCALE:GREGORIAN",
    `METHOD:${input.method}`,
    "BEGIN:VEVENT",
    `UID:${invitationUid(input.lessonId)}`,
    `DTSTAMP:${formatIcsUtc(input.now)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTART:${formatIcsUtc(input.startsAt)}`,
    ...(end ? [`DTEND:${formatIcsUtc(end)}`] : []),
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    `SUMMARY:${escapeIcsText(lessonCalendarSummary(input.courseTitle, input.lessonTitle))}`,
    `DESCRIPTION:${escapeIcsText(lessonCalendarDescription(input.sessionPageUrl, input.locale))}`,
    `URL:${input.sessionPageUrl}`,
    `LOCATION:${escapeIcsText(input.sessionPageUrl)}`,
    `ORGANIZER;CN=${quoteParam(input.organizer.name)}:${calAddress(input.organizer.address)}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:${calAddress(input.attendee)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
};
