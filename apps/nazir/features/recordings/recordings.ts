import type {
  CourseDetailResponse,
  RecordingResponse,
} from "@medaris/services/tedrisat";
import { normalizeMeetingUrl } from "@medaris/utils";
import { linkProblem, sendableLink } from "../sessions/sessions";

/**
 * Ders kayıtları as rules: a course's sessions with the recording each one
 * holds, what the add and edit form check before anything is sent, what each
 * write sends, and which sentence a refusal gets. Pure on purpose, so the
 * page and the form have nothing to decide. A session holds one recording; it
 * is a pasted link, never an upload. tedrisat reads the provider off the link
 * the same way (`providerOfUrl`), and it is the authority: this only lets the
 * form say so before the write.
 */

export const recordingsHref = (courseId: string): string =>
  `/ders/${encodeURIComponent(courseId)}/kayitlar`;

// ---- the list ---------------------------------------------------------------------

export type Provider = RecordingResponse["provider"];
export type Visibility = RecordingResponse["visibility"];
export type RecordingState = RecordingResponse["status"];

/** One recording as the table shows it: plain data, nothing that depends on the clock. */
export interface RecordingFact {
  id: string;
  title: string;
  provider: Provider;
  /** null while the recording is PROCESSING */
  url: string | null;
  status: RecordingState;
  visibility: Visibility;
}

/** One session of a week and the recording it holds, if any. */
export interface SessionSlot {
  lessonId: string;
  title: string;
  /** ISO time; null for a session with no time set */
  startsAt: string | null;
  recording: RecordingFact | null;
}

export interface WeekBlock {
  weekId: string;
  weekNumber: number;
  title: string;
  slots: SessionSlot[];
}

/**
 * The weeks of the course, newest first as tedris lists them, each with its
 * live sessions by time. A session of another kind is listed only if it holds
 * a recording, and a cancelled one only if it still does; a week with nothing
 * to list is left out.
 */
export function recordingWeeks(
  course: Pick<CourseDetailResponse, "weeks">,
  recordings: readonly RecordingResponse[]
): WeekBlock[] {
  const byLesson = new Map(
    recordings.map((recording) => [recording.lessonId, recording] as const)
  );
  return course.weeks
    .map((week): WeekBlock => {
      const slots = week.lessons.flatMap((lesson): SessionSlot[] => {
        const recording = byLesson.get(lesson.id) ?? null;
        const cancelled = Boolean(lesson.cancelledAt);
        if (!recording && (lesson.type !== "LIVE" || cancelled)) return [];
        return [
          {
            lessonId: lesson.id,
            title: lesson.title,
            startsAt: lesson.scheduledAt
              ? new Date(lesson.scheduledAt).toISOString()
              : null,
            recording: recording
              ? {
                  id: recording.id,
                  title: recording.title,
                  provider: recording.provider,
                  url: recording.url ?? null,
                  status: recording.status,
                  visibility: recording.visibility,
                }
              : null,
          },
        ];
      });
      slots.sort(
        (a, b) =>
          (a.startsAt ? Date.parse(a.startsAt) : Number.POSITIVE_INFINITY) -
          (b.startsAt ? Date.parse(b.startsAt) : Number.POSITIVE_INFINITY)
      );
      return {
        weekId: week.id,
        weekNumber: week.weekNumber,
        title: week.title,
        slots,
      };
    })
    .filter((block) => block.slots.length > 0)
    .sort((a, b) => b.weekNumber - a.weekNumber);
}

export type SlotState = "recorded" | "missing" | "notYet";

/**
 * What a session offers: its recording, "Kayıt ekle" once it has begun, or
 * nothing yet. A session with no time set can be recorded: nothing says it has
 * not happened.
 */
export function slotState(slot: SessionSlot, now: Date): SlotState {
  if (slot.recording) return "recorded";
  if (slot.startsAt && Date.parse(slot.startsAt) > now.getTime()) {
    return "notYet";
  }
  return "missing";
}

/** How many sessions hold a recording, and how many that have begun do not. */
export function slotCounts(
  blocks: readonly WeekBlock[],
  now: Date
): { recorded: number; missing: number } {
  let recorded = 0;
  let missing = 0;
  for (const block of blocks) {
    for (const slot of block.slots) {
      const state = slotState(slot, now);
      if (state === "recorded") recorded += 1;
      else if (state === "missing") missing += 1;
    }
  }
  return { recorded, missing };
}

/** The host of a link, for a recording whose provider has no name of its own. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The chip's platform id of a provider, or null for one that has no chip of its own. */
export const chipOf = (
  provider: Provider
): "youtube" | "google-drive" | null =>
  provider === "YOUTUBE"
    ? "youtube"
    : provider === "DRIVE"
      ? "google-drive"
      : null;

// ---- the form ---------------------------------------------------------------------

/** What the add and edit form holds. */
export interface RecordingForm {
  title: string;
  url: string;
  isPublic: boolean;
}

const onDomain = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`);

/** Where a link lives, read off its host: YouTube and Google Drive have names, everything else is OTHER. */
export function providerOfLink(value: string): Provider {
  const url = sendableLink(value);
  if (!url) return "OTHER";
  const host = hostOf(url).toLowerCase();
  if (
    onDomain(host, "youtube.com") ||
    onDomain(host, "youtube-nocookie.com") ||
    host === "youtu.be"
  ) {
    return "YOUTUBE";
  }
  if (onDomain(host, "drive.google.com") || onDomain(host, "docs.google.com")) {
    return "DRIVE";
  }
  return "OTHER";
}

export type FormProblem = "title" | "linkEmpty" | "link" | "youtubePublic";

/** The first thing wrong with each field; the submit stays off while any is. */
export function formErrors(
  form: RecordingForm
): Partial<Record<FormProblem, true>> {
  const errors: Partial<Record<FormProblem, true>> = {};
  if (!form.title.trim()) errors.title = true;
  if (!form.url.trim()) errors.linkEmpty = true;
  else if (linkProblem(form.url) !== null) errors.link = true;
  else if (providerOfLink(form.url) === "YOUTUBE" && !form.isPublic) {
    errors.youtubePublic = true;
  }
  return errors;
}

/** The switch cannot move: a YouTube recording stays public, and a closed course opens nothing. */
export function switchLocked(
  form: Pick<RecordingForm, "url" | "isPublic">,
  closed: boolean
): { locked: boolean; reason: "youtube" | "closed" | null } {
  if (form.isPublic && providerOfLink(form.url) === "YOUTUBE") {
    return { locked: true, reason: "youtube" };
  }
  if (closed && !form.isPublic) return { locked: true, reason: "closed" };
  return { locked: false, reason: null };
}

/** The form a new recording starts from: the session's name makes the title. */
export const newForm = (
  sessionTitle: string,
  suffix: string
): RecordingForm => ({
  title: `${sessionTitle} ${suffix}`.trim(),
  url: "",
  isPublic: false,
});

/** The form an existing recording starts from. */
export const formOf = (recording: RecordingFact): RecordingForm => ({
  title: recording.title,
  url: recording.url ?? "",
  isPublic: recording.visibility === "PUBLIC",
});

/** The body of "Kaydı ekle"; null while the form has a problem. */
export function createBody(form: RecordingForm): {
  title: string;
  url: string;
  visibility: Visibility;
} | null {
  const url = sendableLink(form.url);
  if (!url || Object.keys(formErrors(form)).length > 0) return null;
  return {
    title: form.title.trim(),
    url,
    visibility: form.isPublic ? "PUBLIC" : "ENROLLED",
  };
}

/**
 * The body of "Kaydet" on an existing recording: only what changed, so the
 * link is not written again when it was not touched. Null while the form has
 * a problem, and also when nothing changed.
 */
export function patchBody(
  form: RecordingForm,
  recording: RecordingFact
): { title?: string; url?: string; visibility?: Visibility } | null {
  if (Object.keys(formErrors(form)).length > 0) return null;
  const url = sendableLink(form.url);
  if (!url) return null;
  const body: { title?: string; url?: string; visibility?: Visibility } = {};
  if (form.title.trim() !== recording.title) body.title = form.title.trim();
  if (url !== normalizeMeetingUrl(recording.url)) body.url = url;
  const visibility: Visibility = form.isPublic ? "PUBLIC" : "ENROLLED";
  if (visibility !== recording.visibility) body.visibility = visibility;
  return Object.keys(body).length > 0 ? body : null;
}

// ---- what the API refuses -----------------------------------------------------------

/** The message key (from the catalogue's root) of a refused write, from the code the API answered with. */
export function recordingErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "RECORDING_EXISTS":
      return "Recordings.errors.exists";
    case "LESSON_CANCELLED":
      return "Recordings.errors.cancelled";
    case "LESSON_NOT_FOUND":
    case "RECORDING_NOT_FOUND":
      return "Recordings.errors.gone";
    case "RECORDING_YOUTUBE_PUBLIC_ONLY":
      return "Recordings.errors.youtubePublicOnly";
    case "VALIDATION_ERROR":
      return "Recordings.errors.invalid";
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether the answer means the page was out of date, so it is read again. */
export const recordingsMoved = (code: string): boolean =>
  code === "RECORDING_EXISTS" ||
  code === "LESSON_CANCELLED" ||
  code === "LESSON_NOT_FOUND" ||
  code === "RECORDING_NOT_FOUND";
