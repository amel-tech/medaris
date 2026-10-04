import type { CalendarLocale } from "../course/calendar/lesson-calendar";

/**
 * The words of a lesson-invitation e-mail (MDRS-121), in the three languages
 * Medaris speaks. The calendar part carries the event; this is what a mail
 * client shows beside it, and what a client that does not read calendar
 * parts shows instead.
 *
 * Like the event, the mail names the session, its time and its page — never
 * the meeting link, which stays behind enrollment on that page.
 *
 * Pure: the caller passes the times and the URLs.
 */
export type InvitationKind = "NEW" | "UPDATE" | "CANCEL";

export interface InvitationMailInput {
  kind: InvitationKind;
  locale: CalendarLocale;
  courseTitle: string;
  lessonTitle: string;
  startsAt: Date;
  durationMinutes: number | null;
  /** IANA zone the time is written in: the talebe's own, else the course's. */
  timeZone: string;
  sessionPageUrl: string;
  /** Hesap, where the invitations are turned off. */
  accountUrl: string;
}

export interface InvitationMail {
  subject: string;
  text: string;
  html: string;
}

interface Words {
  subject: Record<InvitationKind, string>;
  lead: Record<InvitationKind, (lesson: string, course: string) => string>;
  when: string;
  minutes: (n: number) => string;
  page: string;
  open: string;
  link: string;
  footer: string;
  turnOff: string;
}

const WORDS: Record<CalendarLocale, Words> = {
  tr: {
    subject: { NEW: "Davet", UPDATE: "Güncellendi", CANCEL: "İptal" },
    lead: {
      NEW: (l, c) => `${c} dersinin “${l}” celsesine davetlisin.`,
      UPDATE: (l, c) =>
        `${c} dersinin “${l}” celsesi değişti. Takvimindeki kayıt bu davetle güncellenir.`,
      CANCEL: (l, c) =>
        `${c} dersinin “${l}” celsesi için gönderilen davet geri alındı. Takvimindeki kayıt kaldırılır.`,
    },
    when: "Zaman",
    minutes: (n) => `${n} dakika`,
    page: "Celse sayfası",
    open: "Celse sayfasını aç",
    link: "Toplantı bağlantısı yalnızca celse sayfasında, derse kayıtlıyken giriş yaptığında görünür.",
    footer:
      "Bu e-postayı Medaris’teki ders kaydın nedeniyle aldın; yanıtlaman gerekmez.",
    turnOff: "Ders davetlerini Hesap sayfasından kapatabilirsin",
  },
  en: {
    subject: { NEW: "Invitation", UPDATE: "Updated", CANCEL: "Cancelled" },
    lead: {
      NEW: (l, c) => `You are invited to the session “${l}” of ${c}.`,
      UPDATE: (l, c) =>
        `The session “${l}” of ${c} has changed. This invitation updates the entry in your calendar.`,
      CANCEL: (l, c) =>
        `The invitation to the session “${l}” of ${c} has been withdrawn. The entry is removed from your calendar.`,
    },
    when: "When",
    minutes: (n) => `${n} minutes`,
    page: "Session page",
    open: "Open the session page",
    link: "The meeting link is shown only on the session page, while you are signed in and enrolled in the course.",
    footer:
      "You received this e-mail because you are enrolled in a course on Medaris; there is no need to reply.",
    turnOff: "You can turn lesson invitations off on your Account page",
  },
  ar: {
    subject: { NEW: "دعوة", UPDATE: "تحديث", CANCEL: "إلغاء" },
    lead: {
      NEW: (l, c) => `أنت مدعو إلى حلقة «${l}» من درس ${c}.`,
      UPDATE: (l, c) =>
        `تغيّرت حلقة «${l}» من درس ${c}. تُحدِّث هذه الدعوة الموعد في تقويمك.`,
      CANCEL: (l, c) =>
        `سُحبت الدعوة إلى حلقة «${l}» من درس ${c}. يُزال الموعد من تقويمك.`,
    },
    when: "الموعد",
    minutes: (n) => `${n} دقيقة`,
    page: "صفحة الحلقة",
    open: "افتح صفحة الحلقة",
    link: "يظهر رابط الاجتماع في صفحة الحلقة فقط، عند تسجيل دخولك وأنت مسجَّل في الدرس.",
    footer: "وصلتك هذه الرسالة لأنك مسجَّل في درس على Medaris؛ لا حاجة إلى الرد.",
    turnOff: "يمكنك إيقاف دعوات الدروس من صفحة الحساب",
  },
};

const INTL_LOCALE: Record<CalendarLocale, string> = {
  tr: "tr-TR",
  en: "en-GB",
  ar: "ar",
};

/** The start in the reader's language and zone, the zone named. */
export const formatInvitationTime = (
  date: Date,
  locale: CalendarLocale,
  timeZone: string
): string => {
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(date);
  return `${when} (${zoneLabel(date, locale, timeZone)})`;
};

const zoneLabel = (
  date: Date,
  locale: CalendarLocale,
  timeZone: string
): string =>
  new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? timeZone;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildInvitationMail = (
  input: InvitationMailInput
): InvitationMail => {
  const w = WORDS[input.locale];
  const lead = w.lead[input.kind](input.lessonTitle, input.courseTitle);
  const when = formatInvitationTime(
    input.startsAt,
    input.locale,
    input.timeZone
  );
  const whenLine =
    input.durationMinutes && input.durationMinutes > 0
      ? `${when} · ${w.minutes(input.durationMinutes)}`
      : when;
  // One line, no newline a header could be split at.
  const subject =
    `${w.subject[input.kind]}: ${input.courseTitle} — ${input.lessonTitle}`
      .replace(/[\r\n]+/g, " ")
      .trim();

  const text = [
    lead,
    "",
    `${w.when}: ${whenLine}`,
    ...(input.kind === "CANCEL"
      ? []
      : [`${w.page}: ${input.sessionPageUrl}`, "", w.link]),
    "",
    "—",
    w.footer,
    `${w.turnOff}: ${input.accountUrl}`,
    "",
  ].join("\n");

  const dir = input.locale === "ar" ? "rtl" : "ltr";
  const page = escapeHtml(input.sessionPageUrl);
  const html = [
    `<!doctype html><html lang="${input.locale}" dir="${dir}"><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f">`,
    `<p>${escapeHtml(lead)}</p>`,
    `<p><strong>${escapeHtml(w.when)}:</strong> ${escapeHtml(whenLine)}</p>`,
    ...(input.kind === "CANCEL"
      ? []
      : [
          `<p><a href="${page}">${escapeHtml(w.open)}</a></p>`,
          `<p style="color:#555">${escapeHtml(w.link)}</p>`,
        ]),
    `<hr style="border:none;border-top:1px solid #ddd">`,
    `<p style="color:#777;font-size:13px">${escapeHtml(w.footer)}<br><a href="${escapeHtml(input.accountUrl)}">${escapeHtml(w.turnOff)}</a></p>`,
    "</body></html>",
  ].join("");

  return { subject, text, html };
};
