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
 * page and the form have nothing to decide. A session holds one recording; on
 * this page it is a pasted link, never an upload. tedrisat reads the link
 * (`detectRecordingLink`) and is the authority: the host rule here only lets
 * the form name the provider while the link is typed, and a link tedrisat
 * refuses comes back as a reason the page words.
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

/**
 * The chip's platform id of a provider, or null for one that has no chip of
 * its own. The design kit gives Bunny no chip (`recording-providers.json`:
 * Medaris's own host, played in the page), so a Bunny recording shows its
 * host, as any other host does.
 */
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

/** The domains of every Bunny host, as tedrisat's `detectRecordingLink` lists them. */
const BUNNY_DOMAINS = ["mediadelivery.net", "bunnycdn.com", "b-cdn.net"];

/**
 * Where a link lives, read off its host as tedrisat reads it: YouTube, Google
 * Drive and Bunny have names, everything else is OTHER. Any host on a Bunny
 * domain is Bunny's: tedrisat takes a player link of Medaris's own library
 * and refuses the rest, which the page then words. Nothing is asked of any
 * host.
 */
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
  if (BUNNY_DOMAINS.some((domain) => onDomain(host, domain))) return "BUNNY";
  return "OTHER";
}

export type FormProblem = "title" | "linkEmpty" | "link";

/** The first thing wrong with each field; the submit stays off while any is. */
export function formErrors(
  form: RecordingForm
): Partial<Record<FormProblem, true>> {
  const errors: Partial<Record<FormProblem, true>> = {};
  if (!form.title.trim()) errors.title = true;
  if (!form.url.trim()) errors.linkEmpty = true;
  else if (linkProblem(form.url) !== null) errors.link = true;
  return errors;
}

/**
 * The switch cannot move: a closed course opens nothing to everyone. A
 * recording that is already public can still be closed. Any provider may be
 * either: the owner dropped "YouTube is public only" on 3 October.
 */
export function switchLocked(
  form: Pick<RecordingForm, "isPublic">,
  closed: boolean
): { locked: boolean; reason: "closed" | null } {
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

/** tedrisat's reasons for a link it cannot store (`RECORDING_LINK_INVALID`), and their message keys. */
const LINK_INVALID_KEYS: Record<string, string> = {
  invalid: "invalid",
  "not-https": "notHttps",
  "youtube-no-video": "youtubeNoVideo",
  "bunny-no-video": "bunnyNoVideo",
  "bunny-foreign-library": "bunnyForeignLibrary",
  "bunny-video-used": "bunnyVideoUsed",
};

/** The `reason` a refusal carries in its context, or null; it is a code, never a sentence. */
export function refusalReasonOf(errorBody: unknown): string | null {
  const context =
    errorBody && typeof errorBody === "object" && "context" in errorBody
      ? (errorBody as { context: unknown }).context
      : null;
  const reason =
    context && typeof context === "object" && "reason" in context
      ? (context as { reason: unknown }).reason
      : null;
  return typeof reason === "string" ? reason : null;
}

/**
 * The message key (from the catalogue's root) of a refused write, from the
 * code the API answered with and, for a link it cannot store, the reason. A
 * reason this page does not know yet is worded as a link that cannot be read.
 */
export function recordingErrorKey(
  code: string,
  reason: string | null = null
): string {
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
    case "RECORDING_LINK_INVALID":
      return `Recordings.errors.linkInvalid.${
        reason !== null && Object.hasOwn(LINK_INVALID_KEYS, reason)
          ? LINK_INVALID_KEYS[reason]
          : "invalid"
      }`;
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
