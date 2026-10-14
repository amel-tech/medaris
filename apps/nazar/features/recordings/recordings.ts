import type {
  CourseDetailResponse,
  RecordingResponse,
} from "@medaris/services/tedrisat";
import {
  isoToZonedLocal,
  normalizeMeetingUrl,
  zonedLocalToIso,
} from "@medaris/utils";
import {
  DEFAULT_SESSION_MINUTES,
  linkProblem,
  sendableLink,
} from "../sessions/sessions";

/**
 * Ders kayıtları as rules: a course's sessions with the recording each one
 * holds, what the add and edit form check before anything is sent, what each
 * write sends, and which sentence a refusal gets. Pure on purpose, so the
 * page and the form have nothing to decide. A session holds one recording: a
 * pasted link, or a video uploaded to Bunny Stream from the browser
 * (`bunny-upload.ts`), which is PROCESSING until tedrisat's encoding poll
 * sees Bunny finish. tedrisat reads a pasted link (`detectRecordingLink`) and
 * is the authority: the host rule here only lets the form name the provider
 * while the link is typed, and a link tedrisat refuses comes back as a reason
 * the page words.
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
  /** ISO time the session is over (a lesson without a length is an hour); null with no time set */
  endsAt: string | null;
  /**
   * The session's live stream link, when the page could read it (the caller
   * holds `session.live_link`): what "Yayını kayıt olarak ekle" sends.
   */
  streamUrl: string | null;
  recording: RecordingFact | null;
  /**
   * ISO time talebe may watch the session's recording from (MDRS-288); null
   * opens it as soon as it is READY. Kept on the session, so a session with
   * no recording yet may have one.
   */
  availableAt: string | null;
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
 * to list is left out. `streams` are the stream links by session, when they
 * could be read.
 */
export function recordingWeeks(
  course: Pick<CourseDetailResponse, "weeks">,
  recordings: readonly RecordingResponse[],
  streams: Readonly<Record<string, string>> = {}
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
        const start = lesson.scheduledAt
          ? new Date(lesson.scheduledAt).getTime()
          : null;
        // the course read carries the session's time; a recording carries it too
        const release =
          lesson.recordingAvailableAt ?? recording?.availableAt ?? null;
        return [
          {
            lessonId: lesson.id,
            title: lesson.title,
            startsAt: start === null ? null : new Date(start).toISOString(),
            endsAt:
              start === null
                ? null
                : new Date(
                    start +
                      (lesson.durationMinutes ?? DEFAULT_SESSION_MINUTES) *
                        60_000
                  ).toISOString(),
            streamUrl: Object.hasOwn(streams, lesson.id)
              ? (streams[lesson.id] ?? null)
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
            availableAt: release ? new Date(release).toISOString() : null,
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

/**
 * "Yayını kayıt olarak ekle" (MDRS-283): the stream link of a session that is
 * over, has a stream and holds no recording; null for any other. The link is
 * sent to the recording route as it is: tedrisat reads a `/live/<id>` link as
 * the YouTube video, which plays once YouTube has archived the stream.
 */
export function streamToRecord(slot: SessionSlot, now: Date): string | null {
  if (slot.recording || !slot.streamUrl || !slot.endsAt) return null;
  return Date.parse(slot.endsAt) <= now.getTime() ? slot.streamUrl : null;
}

/** The body that adds a session's stream as its recording: the form's title, for the enrolled. */
export const streamRecordingBody = (
  slot: Pick<SessionSlot, "title">,
  streamUrl: string,
  suffix: string
): { title: string; url: string; visibility: Visibility } => ({
  title: newForm(slot.title, suffix).title,
  url: streamUrl,
  visibility: "ENROLLED",
});

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

/**
 * A Bunny upload not READY yet: its bytes may still be on their way (then the
 * one who uploads can continue it) or Bunny is encoding it. Only these rows
 * move on their own, when tedrisat's poll sees Bunny finish; a pasted link
 * that is PROCESSING waits for someone to edit it.
 */
export const bunnyPending = (slot: SessionSlot): boolean =>
  slot.recording?.provider === "BUNNY" &&
  slot.recording.status === "PROCESSING";

/**
 * Whether a video uploaded to Bunny may take the recording's place from its
 * "Düzenle": any recording. A pasted or stream link, since the owner added a
 * session's stream as its recording, found the stream private and had no way
 * left to upload its video (12 October); a Bunny video in any status too,
 * since a wrong file uploaded to a session must be replaceable (13 October,
 * "yanlış dosya yüklemiş olsak değiştiremeyecek miyiz?"). tedrisat's
 * `uploadReplaces` lets a Bunny video go only when the upload says so
 * (`replacesVideo`, `uploadBody`).
 */
export const uploadReplaces = (
  recording: Pick<RecordingFact, "provider"> | null
): boolean => recording !== null;

/**
 * Whether an upload from this recording's "Düzenle" replaces a Bunny video,
 * which tedrisat deletes from Bunny once the new upload is over: the upload
 * then says so (`replaceVideo`), and the dialog warns of it.
 */
export const replacesVideo = (
  recording: Pick<RecordingFact, "provider"> | null
): boolean => recording?.provider === "BUNNY";

/** Whether the page has a Bunny upload to wait for, so it is read again until none is left. */
export const anyBunnyPending = (blocks: readonly WeekBlock[]): boolean =>
  blocks.some((block) => block.slots.some(bunnyPending));

// ---- when talebe may watch (MDRS-288) ------------------------------------------------

/**
 * The "Erişim" cell: "Açık" once talebe can watch the recording, "{when}
 * açılır" while the session's time is ahead (a session with no recording yet
 * included), and "Hazır olunca açılır" otherwise: the recording is not READY,
 * or not there yet, and nothing holds it back. tedrisat's rule
 * (`isReleased`): open when READY and the time, if any, is not after now.
 */
export type Access =
  | { kind: "open" }
  | { kind: "at"; at: Date }
  | { kind: "whenReady" };

export function accessOf(
  slot: Pick<SessionSlot, "recording" | "availableAt">,
  now: Date
): Access {
  const at = slot.availableAt ? new Date(slot.availableAt) : null;
  if (at && at.getTime() > now.getTime()) return { kind: "at", at };
  return slot.recording?.status === "READY"
    ? { kind: "open" }
    : { kind: "whenReady" };
}

/** The sessions of the course read that have a time set, as `{ lessonId: ISO time }`. */
export function releasesOf(
  course: Pick<CourseDetailResponse, "weeks">
): Record<string, string> {
  return Object.fromEntries(
    course.weeks.flatMap((week) =>
      week.lessons.flatMap((lesson) =>
        lesson.recordingAvailableAt
          ? [
              [
                lesson.id,
                new Date(lesson.recordingAvailableAt).toISOString(),
              ] as const,
            ]
          : []
      )
    )
  );
}

/**
 * The choice "Hazır olunca hemen" / "Şu tarih ve saatte" as a form holds it.
 * The date and time are a wall time on the course's clock, as the course is
 * planned (`courses.time_zone`), whatever the viewer's.
 */
export interface ReleaseForm {
  mode: "ready" | "at";
  /** "YYYY-MM-DDTHH:mm" on the course's clock, or "" */
  local: string;
  /** the field holds text it cannot read, or only one half of it */
  bad: boolean;
}

/** The form a session's time starts from. */
export const releaseFormOf = (
  availableAt: string | null,
  timeZone: string
): ReleaseForm => ({
  mode: availableAt ? "at" : "ready",
  local: isoToZonedLocal(availableAt, timeZone),
  bad: false,
});

/**
 * The instant the form names: null for "Hazır olunca hemen", undefined when
 * the field cannot be read. A field left as the stored time sends that time
 * back as it is (the field has minute precision).
 */
function releaseInstant(
  form: ReleaseForm,
  held: string | null,
  timeZone: string
): string | null | undefined {
  if (form.mode === "ready") return null;
  if (form.bad || !form.local) return undefined;
  if (held && form.local === isoToZonedLocal(held, timeZone)) {
    return new Date(held).toISOString();
  }
  return zonedLocalToIso(form.local, timeZone) ?? undefined;
}

export type ReleaseProblem = "empty" | "past";

/**
 * What is wrong with the choice: "empty" when "Şu tarih ve saatte" has no
 * readable date and time, "past" when a new time is not after now (the
 * stored one may be: the recording opened then). Null when it is fine.
 */
export function releaseProblem(
  form: ReleaseForm,
  held: string | null,
  timeZone: string,
  now: Date
): ReleaseProblem | null {
  const at = releaseInstant(form, held, timeZone);
  if (at === null) return null;
  if (at === undefined) return "empty";
  const stored = held ? new Date(held).toISOString() : null;
  return at !== stored && Date.parse(at) <= now.getTime() ? "past" : null;
}

/**
 * What a write sends of the choice: `{ availableAt }`, null for "Hazır olunca
 * hemen", or null when it is what the session holds, so nothing is written
 * again. Read only once `releaseProblem` has nothing to say.
 */
export function releaseChange(
  form: ReleaseForm,
  held: string | null,
  timeZone: string
): { availableAt: string | null } | null {
  const at = releaseInstant(form, held, timeZone);
  if (at === undefined) return null;
  const stored = held ? new Date(held).toISOString() : null;
  return at === stored ? null : { availableAt: at };
}

/** The message key of a refused write of the time (`PUT /lessons/:id/recording-availability`). */
export function releaseErrorKey(code: string): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "LESSON_NOT_FOUND":
      return "Recordings.errors.gone";
    case "VALIDATION_ERROR":
      return "Recordings.release.errors.invalid";
    default:
      return "Problems.actionGeneric";
  }
}

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

/**
 * The body of "Kaydı ekle"; null while the form has a problem. A changed
 * release time (`releaseChange`) goes with the link, so tedrisat writes both
 * at once and a recording added for later is never open in between (MDRS-288).
 */
export function createBody(
  form: RecordingForm,
  release: { availableAt: string | null } | null = null
): {
  title: string;
  url: string;
  visibility: Visibility;
  availableAt?: string | null;
} | null {
  const url = sendableLink(form.url);
  if (!url || Object.keys(formErrors(form)).length > 0) return null;
  return {
    title: form.title.trim(),
    url,
    visibility: form.isPublic ? "PUBLIC" : "ENROLLED",
    ...(release ? { availableAt: release.availableAt } : {}),
  };
}

/**
 * The body of "Kaydet" on an existing recording: only what changed, so the
 * link is not written again when it was not touched, the release time
 * (`releaseChange`) included. Null while the form has a problem, and also
 * when nothing changed.
 */
export function patchBody(
  form: RecordingForm,
  recording: RecordingFact,
  release: { availableAt: string | null } | null = null
): {
  title?: string;
  url?: string;
  visibility?: Visibility;
  availableAt?: string | null;
} | null {
  if (Object.keys(formErrors(form)).length > 0) return null;
  const url = sendableLink(form.url);
  if (!url) return null;
  const body: {
    title?: string;
    url?: string;
    visibility?: Visibility;
    availableAt?: string | null;
  } = {};
  if (form.title.trim() !== recording.title) body.title = form.title.trim();
  if (url !== normalizeMeetingUrl(recording.url)) body.url = url;
  const visibility: Visibility = form.isPublic ? "PUBLIC" : "ENROLLED";
  if (visibility !== recording.visibility) body.visibility = visibility;
  if (release) body.availableAt = release.availableAt;
  return Object.keys(body).length > 0 ? body : null;
}

/**
 * The body of "Yükle": the title, who may watch, and the session's time as
 * when it was recorded (what tedrisat sets for a pasted link). From the
 * "Düzenle" of a Bunny recording (`editing`) it also says the upload replaces
 * that video (`replaceVideo`); "Kayıt ekle" never does, so two people adding
 * at once still collide. Null while the title is empty; the link is not this
 * tab's.
 */
export function uploadBody(
  form: RecordingForm,
  slot: Pick<SessionSlot, "startsAt">,
  editing: Pick<RecordingFact, "provider"> | null = null
): {
  title: string;
  visibility: Visibility;
  recordedAt?: string;
  replaceVideo?: true;
} | null {
  if (!form.title.trim()) return null;
  return {
    title: form.title.trim(),
    visibility: form.isPublic ? "PUBLIC" : "ENROLLED",
    ...(slot.startsAt ? { recordedAt: slot.startsAt } : {}),
    ...(replacesVideo(editing) ? { replaceVideo: true as const } : {}),
  };
}

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** A file's size in the page's language, in the largest decimal unit under it: "1,2 GB". */
export function formatBytes(bytes: number, locale: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const options: Intl.NumberFormatOptions = {
    style: "unit",
    unit: BYTE_UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit < 2 ? 0 : 1,
  };
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat("tr-TR", options).format(value);
  }
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

/**
 * The message key of an upload that stopped: a refusal of tedrisat's upload
 * routes by its code (and, for one it will not sign again, its reason), or
 * what happened between the browser and Bunny (`tusFailureCode`).
 */
export function uploadErrorKey(
  code: string,
  reason: string | null = null
): string {
  switch (code) {
    case "AUTHZ_FORBIDDEN":
      return "Problems.actionForbidden";
    case "RECORDING_EXISTS":
      return "Recordings.errors.exists";
    case "LESSON_NOT_FOUND":
      return "Recordings.errors.gone";
    case "BUNNY_STREAM_NOT_CONFIGURED":
      return "Recordings.upload.errors.notConfigured";
    case "BUNNY_STREAM_UNAVAILABLE":
      return "Recordings.upload.errors.unavailable";
    case "RECORDING_UPLOAD_CLOSED":
      return reason === "expired"
        ? "Recordings.upload.errors.expired"
        : "Recordings.upload.errors.closed";
    case "RECORDING_UPLOAD_NOT_FOUND":
      return "Recordings.upload.errors.closed";
    case "VALIDATION_ERROR":
      return "Recordings.upload.errors.invalid";
    case "UPLOAD_NOT_FOUND":
      return "Recordings.upload.errors.notFound";
    case "UPLOAD_NETWORK":
      return "Recordings.upload.errors.network";
    case "UPLOAD_REFUSED":
      return "Recordings.upload.errors.refused";
    case "UPLOAD_FAILED":
      return "Recordings.upload.errors.failed";
    default:
      return "Problems.actionGeneric";
  }
}

/** Whether a stopped upload means the page was out of date, so it is read again behind the dialog. */
export const uploadMoved = (code: string): boolean =>
  code === "RECORDING_EXISTS" ||
  code === "LESSON_NOT_FOUND" ||
  code === "RECORDING_UPLOAD_CLOSED" ||
  code === "RECORDING_UPLOAD_NOT_FOUND";

/**
 * Whether "Devam et" can continue a stopped upload: the video exists and what
 * stopped it was between the browser and Bunny, not a refusal of tedrisat's.
 */
export const uploadContinues = (
  code: string,
  videoId: string | null
): boolean =>
  videoId !== null &&
  (code === "UPLOAD_NETWORK" ||
    code === "UPLOAD_REFUSED" ||
    code === "UPLOAD_FAILED");
