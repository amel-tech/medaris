import type { CalendarLocale } from "../course/calendar/lesson-calendar";
import { formatInvitationTime } from "../lesson-invitation/invitation-mail";

/**
 * The 24-hour exam reminder (MDRS-248), in the three languages Medaris
 * speaks. Like an invitation it names the exam, its time and its page, never
 * a meeting link, which stays behind enrollment on that page.
 *
 * Pure: the caller passes the time and the URLs.
 */
export interface ExamReminderMailInput {
  locale: CalendarLocale;
  courseTitle: string;
  lessonTitle: string;
  startsAt: Date;
  /** IANA zone the time is written in: the talebe's own, else the course's. */
  timeZone: string;
  sessionPageUrl: string;
  /** Hesap, where lesson e-mails are turned off. */
  accountUrl: string;
}

interface Words {
  subject: string;
  lead: (lesson: string, course: string) => string;
  when: string;
  open: string;
  footer: string;
  turnOff: string;
}

const WORDS: Record<CalendarLocale, Words> = {
  tr: {
    subject: "Sınav yarın",
    lead: (l, c) => `${c} dersinin “${l}” sınavı yaklaşıyor.`,
    when: "Zaman",
    open: "Sınav celsesini aç",
    footer:
      "Bu e-postayı Medaris’teki ders kaydın nedeniyle aldın; yanıtlaman gerekmez.",
    turnOff: "Ders e-postalarını Hesap sayfasından kapatabilirsin",
  },
  en: {
    subject: "Exam tomorrow",
    lead: (l, c) => `The exam “${l}” of ${c} is coming up.`,
    when: "When",
    open: "Open the exam session",
    footer:
      "You received this e-mail because you are enrolled in a course on Medaris; there is no need to reply.",
    turnOff: "You can turn lesson e-mails off on your Account page",
  },
  ar: {
    subject: "الاختبار غدًا",
    lead: (l, c) => `يقترب اختبار «${l}» من درس ${c}.`,
    when: "الموعد",
    open: "افتح حلقة الاختبار",
    footer: "وصلتك هذه الرسالة لأنك مسجَّل في درس على Medaris؛ لا حاجة إلى الرد.",
    turnOff: "يمكنك إيقاف رسائل الدروس من صفحة الحساب",
  },
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const buildExamReminderMail = (
  input: ExamReminderMailInput
): { subject: string; text: string; html: string } => {
  const w = WORDS[input.locale];
  const lead = w.lead(input.lessonTitle, input.courseTitle);
  const when = formatInvitationTime(
    input.startsAt,
    input.locale,
    input.timeZone
  );
  const dir = input.locale === "ar" ? "rtl" : "ltr";
  const text = [
    lead,
    "",
    `${w.when}: ${when}`,
    `${w.open}: ${input.sessionPageUrl}`,
    "",
    w.footer,
    `${w.turnOff}: ${input.accountUrl}`,
  ].join("\n");
  const html = [
    `<div dir="${dir}" lang="${input.locale}">`,
    `<p>${escapeHtml(lead)}</p>`,
    `<p><strong>${escapeHtml(w.when)}:</strong> ${escapeHtml(when)}</p>`,
    `<p><a href="${escapeHtml(input.sessionPageUrl)}">${escapeHtml(w.open)}</a></p>`,
    `<p style="color:#666">${escapeHtml(w.footer)} <a href="${escapeHtml(input.accountUrl)}">${escapeHtml(w.turnOff)}</a></p>`,
    "</div>",
  ].join("");
  return {
    subject: `${w.subject}: ${input.courseTitle} — ${input.lessonTitle}`,
    text,
    html,
  };
};
